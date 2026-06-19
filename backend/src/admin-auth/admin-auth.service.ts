import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import {
  ADMIN_AUTH_COOKIE,
  ADMIN_AUTH_COOKIE_OPTS,
  ADMIN_LOGIN_OTP_TTL_MS,
  ADMIN_OTP_LENGTH,
  ADMIN_OTP_LOGIN,
  ADMIN_OTP_EMAIL_NOT_AUTHORIZED,
  ADMIN_OTP_REQUEST_GENERIC,
  ADMIN_OTP_RESEND_COOLDOWN_MS,
  ADMIN_OTP_VERIFY_GENERIC,
  adminFrontendOrigin,
} from './admin-auth.constants.js';
import {
  AdminLoginRateLimitError,
  assertAdminVerifyAllowed,
  clearAdminVerifyAttempts,
  recordAdminVerifyFailure,
  shouldAllowAdminOtpRequest,
} from './admin-login-rate-limit.js';
import type { AdminJwtPayload } from './admin-auth.types.js';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async loadAdminSessionUser(adminId: string): Promise<AdminJwtPayload> {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new UnauthorizedException('Admin authentication required');
    }
    return {
      sub: admin.id,
      email: admin.email,
      role: 'admin',
    };
  }

  otpRequestGenericMessage() {
    return ADMIN_OTP_REQUEST_GENERIC;
  }

  async requestLoginOtp(rawEmail: string, ip: string): Promise<void> {
    const email = rawEmail?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email is required.');
    }

    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      throw new ForbiddenException(ADMIN_OTP_EMAIL_NOT_AUTHORIZED);
    }

    if (!shouldAllowAdminOtpRequest(email, ip)) return;

    try {
      await this.assertOtpResendAllowed(email, ADMIN_OTP_LOGIN, admin.id);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      return;
    }

    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + ADMIN_LOGIN_OTP_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.otp.deleteMany({
        where: { adminId: admin.id, purpose: ADMIN_OTP_LOGIN },
      }),
      this.prisma.otp.create({
        data: {
          email,
          otp,
          expiresAt,
          purpose: ADMIN_OTP_LOGIN,
          adminId: admin.id,
        },
      }),
    ]);

    await this.sendAdminOtpEmail({
      to: email,
      otp,
      subject: 'Your Locum Link admin sign-in code',
      intro: 'Use this code to sign in to the Locum Link admin portal:',
      eventType: 'ADMIN_LOGIN_OTP',
      adminId: admin.id,
      ttlMs: ADMIN_LOGIN_OTP_TTL_MS,
    });
  }

  async verifyLoginOtp(
    rawEmail: string,
    otpCode: string,
    ip: string,
  ): Promise<{ adminId: string; email: string }> {
    const email = rawEmail?.trim().toLowerCase();
    const code = otpCode?.trim();

    try {
      assertAdminVerifyAllowed(email, ip);
    } catch (err) {
      if (err instanceof AdminLoginRateLimitError) {
        throw new UnauthorizedException(ADMIN_OTP_VERIFY_GENERIC);
      }
      throw err;
    }

    if (!email || !code || code.length !== ADMIN_OTP_LENGTH) {
      recordAdminVerifyFailure(email || 'unknown', ip);
      throw new UnauthorizedException(ADMIN_OTP_VERIFY_GENERIC);
    }

    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      recordAdminVerifyFailure(email, ip);
      throw new UnauthorizedException(ADMIN_OTP_VERIFY_GENERIC);
    }

    const record = await this.prisma.otp.findFirst({
      where: {
        email,
        otp: code,
        purpose: ADMIN_OTP_LOGIN,
        adminId: admin.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record || record.expiresAt < new Date()) {
      recordAdminVerifyFailure(email, ip);
      throw new UnauthorizedException(ADMIN_OTP_VERIFY_GENERIC);
    }

    await this.prisma.otp.deleteMany({
      where: { adminId: admin.id, purpose: ADMIN_OTP_LOGIN },
    });

    clearAdminVerifyAttempts(email, ip);
    return { adminId: admin.id, email: admin.email };
  }

  setAdminSessionCookie(res: Response, token: string) {
    res.cookie(this.getCookieName(), token, {
      ...ADMIN_AUTH_COOKIE_OPTS,
      maxAge: this.parseAdminJwtCookieMaxAgeMs(),
    });
  }

  async signAdminJwt(params: {
    adminId: string;
    email: string;
  }): Promise<string> {
    const payload: AdminJwtPayload = {
      sub: params.adminId,
      email: params.email,
      role: 'admin',
    };
    return this.jwt.signAsync(payload);
  }

  parseAdminJwtCookieMaxAgeMs(): number {
    const raw = this.config.get<string>('ADMIN_JWT_EXPIRES_IN', '7d');
    const match = /^(\d+)([smhd])$/.exec(raw.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const mult =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60 * 1000
          : unit === 'h'
            ? 60 * 60 * 1000
            : 24 * 60 * 60 * 1000;
    return n * mult;
  }

  getFrontendRedirectUrl() {
    return this.config.get<string>(
      'ADMIN_FRONTEND_REDIRECT_URL',
      'http://localhost:3001/admin',
    );
  }

  getFrontendOrigin(): string {
    return adminFrontendOrigin(this.config);
  }

  getCookieName() {
    return ADMIN_AUTH_COOKIE;
  }

  private generateOtp(): string {
    return String(
      randomInt(10 ** (ADMIN_OTP_LENGTH - 1), 10 ** ADMIN_OTP_LENGTH - 1),
    );
  }

  private async assertOtpResendAllowed(
    email: string,
    purpose: string,
    adminId: string,
  ): Promise<void> {
    const recent = await this.prisma.otp.findFirst({
      where: { email, purpose, adminId },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < ADMIN_OTP_RESEND_COOLDOWN_MS
    ) {
      const waitSec = Math.ceil(
        (ADMIN_OTP_RESEND_COOLDOWN_MS -
          (Date.now() - recent.createdAt.getTime())) /
          1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSec} seconds before requesting another code.`,
      );
    }
  }

  private async sendAdminOtpEmail(params: {
    to: string;
    otp: string;
    subject: string;
    intro: string;
    eventType: string;
    adminId: string;
    ttlMs: number;
  }): Promise<void> {
    const ttlMin = Math.round(params.ttlMs / 60_000);
    const text = [
      params.intro,
      '',
      params.otp,
      '',
      `This code expires in ${ttlMin} minutes.`,
      'If you did not request this code, you can ignore this email.',
    ].join('\n');
    const html = `
      <p>${params.intro}</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:24px 0">${params.otp}</p>
      <p style="color:#5a6478">This code expires in ${ttlMin} minutes.</p>
      <p style="color:#5a6478">If you did not request this code, you can ignore this email.</p>
    `.trim();

    const result = await this.email.send({
      to: params.to,
      subject: params.subject,
      text,
      html,
    });

    await this.prisma.emailLog.create({
      data: {
        recipient: params.to,
        eventType: params.eventType,
        status: result.ok ? 'SENT' : 'FAILED',
        provider: 'zeptomail',
        providerMessageId: result.ok ? result.messageId : undefined,
        error: result.ok ? undefined : result.error,
        referenceId: params.adminId,
        referenceType: 'Admin',
      },
    });

    if (!result.ok) {
      const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
      if (nodeEnv !== 'production') {
        this.logger.warn(
          `ZeptoMail failed (${result.error}); OTP for ${params.to} was not logged here for security.`,
        );
      }
      throw new BadRequestException(
        `Could not send verification email. ${result.error}`,
      );
    }
  }
}
