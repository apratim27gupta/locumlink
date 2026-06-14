import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import { formatAdminDoctorName } from '../notifications/admin-notification-copy.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User, UserStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { GcsService } from '../gcs/gcs.service.js';
import { EmailService } from '../notifications/email.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { AuthTokens } from './interfaces/auth-tokens.interface.js';

const BCRYPT_ROUNDS = 12;
const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

// Current privacy policy / terms version
const CURRENT_CONSENT_VERSION = '1.0';
const DEACTIVATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function isWithinDeactivationRetention(
  deactivatedAt: Date | null | undefined,
): boolean {
  if (!deactivatedAt) return false;
  return Date.now() - deactivatedAt.getTime() < DEACTIVATION_RETENTION_MS;
}

function isDeactivationRetentionExpired(
  deactivatedAt: Date | null | undefined,
): boolean {
  if (!deactivatedAt) return true;
  return Date.now() - deactivatedAt.getTime() >= DEACTIVATION_RETENTION_MS;
}

function isPlaceholderSupabaseKey(key: string | undefined): boolean {
  const s = key?.trim() ?? '';
  if (!s) return true;
  if (/^local-dev/i.test(s)) return true;
  if (/^your-supabase-/i.test(s)) return true;
  if (s.startsWith('sb_publishable_')) return false;
  return s.length < 80;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly gcs: GcsService,
    private readonly adminNotif: AdminNotificationsService,
    private readonly email: EmailService,
  ) {}

  async register(
    dto: RegisterDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    if (existing) {
      if (
        existing.status === UserStatus.DEACTIVATED &&
        isWithinDeactivationRetention(existing.deactivatedAt)
      ) {
        throw new ConflictException(
          'This email belongs to a deactivated account. Sign in within 30 days to restore your profile.',
        );
      }
      if (
        existing.status === UserStatus.DEACTIVATED &&
        isDeactivationRetentionExpired(existing.deactivatedAt)
      ) {
        await this.resetUserToFreshStart(existing.id);
        const user = await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            role: dto.role,
            status: UserStatus.PENDING,
            deactivatedAt: null,
            consentGivenAt: dto.consentGiven === true ? new Date() : null,
            consentVersion:
              dto.consentGiven === true
                ? (dto.consentVersion ?? CURRENT_CONSENT_VERSION)
                : null,
          },
        });
        this.audit.log({
          actorId: user.id,
          subjectId: user.id,
          action: 'CREATE',
          entity: 'User',
          entityId: user.id,
          after: {
            email: user.email,
            role: user.role,
            reRegisteredAfterDeactivation: true,
          },
          outcome: 'SUCCESS',
          actorRole: user.role,
          ...meta,
        });
        return this.issueTokens(user);
      }
      throw new ConflictException('Email already registered');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role,
        // PRD L2-E6.4 / Section 13.1: PIPEDA consent stored immutably at signup
        consentGivenAt: dto.consentGiven === true ? new Date() : null,
        consentVersion:
          dto.consentGiven === true
            ? (dto.consentVersion ?? CURRENT_CONSENT_VERSION)
            : null,
      },
    });

    this.audit.log({
      actorId: user.id,
      subjectId: user.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      after: {
        email: user.email,
        role: user.role,
        consentGiven: dto.consentGiven ?? false,
        consentVersion: dto.consentGiven ? CURRENT_CONSENT_VERSION : null,
      },
      outcome: 'SUCCESS',
      actorRole: user.role,
      ...meta,
    });

    // A-001 / A-002: notify admin dashboard
    try {
      const isHost = dto.role === 'HOST';
      if (isHost) {
        await this.adminNotif.notifyHostRegistration({
          doctorName: formatAdminDoctorName(null, null, user.email),
          clinicLocation: 'pending profile setup',
          userId: user.id,
        });
      } else {
        await this.adminNotif.notifyLocumRegistration({
          doctorName: formatAdminDoctorName(null, null, user.email),
          specialty: 'pending profile setup',
          userId: user.id,
        });
      }
    } catch {}
    return this.issueTokens(user);
  }

  async login(
    dto: LoginDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    let user = await this.validateCredentials(dto.email, dto.password);
    const reactivated =
      user.status === UserStatus.DEACTIVATED &&
      isWithinDeactivationRetention(user.deactivatedAt);
    user = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(reactivated
          ? { status: UserStatus.ACTIVE, deactivatedAt: null }
          : {}),
      },
    });
    this.audit.log({
      actorId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      outcome: 'SUCCESS',
      actorRole: user.role,
      after: reactivated ? { reactivatedFromDeactivation: true } : undefined,
      ...meta,
    });
    return this.issueTokens(user);
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(
        'Your account is suspended. Contact support if you have questions.',
      );
    }
    if (user.status === UserStatus.DEACTIVATED) {
      if (isWithinDeactivationRetention(user.deactivatedAt)) {
        // Password check below; login() reactivates the account.
      } else {
        throw new UnauthorizedException(
          'Your account was deactivated over 30 days ago. Register again to create a new account.',
        );
      }
    } else if (
      user.status !== UserStatus.ACTIVE &&
      user.status !== UserStatus.PENDING
    ) {
      throw new UnauthorizedException('Account suspended or deactivated');
    }
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async validateJwtPayload(payload: JwtPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status === 'DEACTIVATED') {
      throw new UnauthorizedException('Session invalid');
    }
    return user;
  }

  async syncFromSupabaseToken(
    authorizationHeader: string | undefined,
    roleHint: Role,
  ): Promise<AuthTokens> {
    const raw = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!raw) {
      throw new UnauthorizedException('Missing Authorization bearer token');
    }
    const supabaseUrl = (
      this.config.get<string>('SUPABASE_URL') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_URL') ??
      ''
    ).trim();
    const serviceKeyRaw = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = (
      this.config.get<string>('SUPABASE_ANON_KEY') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
      ''
    ).trim();
    const sbKey = !isPlaceholderSupabaseKey(serviceKeyRaw)
      ? serviceKeyRaw!.trim()
      : anonKey;

    if (supabaseUrl && sbKey && !isPlaceholderSupabaseKey(sbKey)) {
      try {
        const sb = createClient(supabaseUrl, sbKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await sb.auth.getUser(raw);
        if (!error && data.user?.email) {
          const user = await this.findOrCreateUserForSupabase(
            data.user.email.toLowerCase(),
            roleHint,
          );
          return this.issueTokens(user);
        }
      } catch {}
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(raw);
      const user = await this.validateJwtPayload(payload);
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException(
        'Invalid session. For OTP login, set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_*) to the same Supabase project as the frontend; do not use a placeholder SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
  }

  async sendOtp(email: string | undefined): Promise<void> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    const recent = await this.prisma.otp.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      const waitSec = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) /
          1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSec} seconds before requesting another code.`,
      );
    }

    const otp = String(randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH - 1));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.otp.deleteMany({ where: { email: normalizedEmail } }),
      this.prisma.otp.create({
        data: { email: normalizedEmail, otp, expiresAt },
      }),
    ]);

    const subject = 'Your Locum Connect verification code';
    const text = [
      'Use this code to sign in to Locum Connect:',
      '',
      otp,
      '',
      'This code expires in 10 minutes.',
      'If you did not request this code, you can ignore this email.',
    ].join('\n');
    const html = `
      <p>Use this code to sign in to <strong>Locum Connect</strong>:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:24px 0">${otp}</p>
      <p style="color:#5a6478">This code expires in 10 minutes.</p>
      <p style="color:#5a6478">If you did not request this code, you can ignore this email.</p>
    `.trim();

    const result = await this.email.send({
      to: normalizedEmail,
      subject,
      text,
      html,
    });

    await this.prisma.emailLog.create({
      data: {
        recipient: normalizedEmail,
        eventType: 'AUTH_OTP',
        status: result.ok ? 'SENT' : 'FAILED',
        provider: 'zeptomail',
        providerMessageId: result.ok ? result.messageId : undefined,
        error: result.ok ? undefined : result.error,
        referenceType: 'Otp',
      },
    });

    if (!result.ok) {
      throw new BadRequestException(
        'Could not send verification email. Check ZEPTOMAIL_API_KEY and MAIL_FROM_ADDRESS.',
      );
    }
  }

  async verifyOtp(
    email: string | undefined,
    otp: string | undefined,
    roleHint: Role,
  ): Promise<AuthTokens> {
    const normalizedEmail = email?.trim().toLowerCase();
    const code = otp?.trim();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }
    if (!code || code.length !== OTP_LENGTH) {
      throw new BadRequestException('A 6-digit verification code is required');
    }

    const record = await this.prisma.otp.findFirst({
      where: { email: normalizedEmail, otp: code },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    await this.prisma.otp.deleteMany({ where: { email: normalizedEmail } });

    const user = await this.findOrCreateUserForSupabase(
      normalizedEmail,
      roleHint,
    );
    return this.issueTokens(user);
  }

  private async findOrCreateUserForSupabase(
    email: string,
    roleHint: Role,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException(
          'Your account is suspended. Contact support if you have questions.',
        );
      }
      if (existing.status === UserStatus.DEACTIVATED) {
        if (isWithinDeactivationRetention(existing.deactivatedAt)) {
          const data: Partial<
            Pick<
              User,
              | 'role'
              | 'status'
              | 'emailVerified'
              | 'emailVerifiedAt'
              | 'lastLoginAt'
              | 'deactivatedAt'
            >
          > = {
            status: UserStatus.ACTIVE,
            deactivatedAt: null,
            emailVerified: true,
            emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            lastLoginAt: new Date(),
          };
          if (existing.role !== roleHint && existing.role !== Role.ADMIN) {
            data.role = roleHint;
          }
          return this.prisma.user.update({
            where: { id: existing.id },
            data,
          });
        }
        await this.resetUserToFreshStart(existing.id);
      }
      const data: Partial<
        Pick<
          User,
          | 'role'
          | 'status'
          | 'emailVerified'
          | 'emailVerifiedAt'
          | 'lastLoginAt'
          | 'deactivatedAt'
        >
      > = {
        status: UserStatus.ACTIVE,
        deactivatedAt: null,
        emailVerified: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        lastLoginAt: new Date(),
      };
      if (existing.role !== roleHint && existing.role !== Role.ADMIN) {
        data.role = roleHint;
      }
      return this.prisma.user.update({
        where: { id: existing.id },
        data,
      });
    }
    const passwordHash = await bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: roleHint,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        // Consent not captured via Supabase OTP flow —
        // user must accept terms in frontend before calling this
        consentGivenAt: new Date(),
        consentVersion: CURRENT_CONSENT_VERSION,
      },
    });
  }

  async presentMe(user: User): Promise<
    Omit<User, 'passwordHash' | 'avatarStoragePath'> & {
      avatarUrl: string | null;
    }
  > {
    const { passwordHash: _, avatarStoragePath, ...rest } = user;
    const trimmed = avatarStoragePath?.trim() ?? '';
    const avatarUrl =
      trimmed.length > 0 ? await this.gcs.signedUrl(trimmed) : null;
    return { ...rest, avatarUrl };
  }

  async setUserAvatarStoragePath(userId: string, storagePath: string) {
    const next = storagePath.trim();
    if (!next) throw new BadRequestException('storagePath is required');
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStoragePath: true },
    });
    if (existing?.avatarStoragePath && existing.avatarStoragePath !== next) {
      await this.gcs.delete(existing.avatarStoragePath);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarStoragePath: next },
    });
  }

  async deactivateAccount(
    userId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Session invalid');
    }
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException(
        'Admin accounts cannot be self-deactivated.',
      );
    }
    if (user.status === UserStatus.DEACTIVATED) {
      return;
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.DEACTIVATED,
        deactivatedAt: new Date(),
        hashedRefreshToken: null,
        lastAppPath: null,
      },
    });
    this.audit.log({
      actorId: userId,
      subjectId: userId,
      action: 'STATUS_CHANGE',
      entity: 'User',
      entityId: userId,
      before: { status: user.status },
      after: {
        status: UserStatus.DEACTIVATED,
        deactivatedAt: new Date().toISOString(),
      },
      outcome: 'SUCCESS',
      actorRole: user.role,
      ...meta,
    });
  }
  async permanentDeleteAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'admin')
      throw new ForbiddenException('Admin accounts cannot be deleted.');
    await this.prisma.user.delete({ where: { id: userId } });
  }
  private async resetUserToFreshStart(userId: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStoragePath: true },
    });
    const avatarPath = existing?.avatarStoragePath?.trim() ?? '';
    if (avatarPath) {
      await this.gcs.delete(avatarPath);
    }
    await this.prisma.$transaction([
      this.prisma.notificationEvent.deleteMany({
        where: { recipientId: userId },
      }),
      this.prisma.locumProfile.deleteMany({ where: { userId } }),
      this.prisma.hostProfile.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.PENDING,
          deactivatedAt: null,
          suspensionNote: null,
          suspendedAt: null,
          hashedRefreshToken: null,
          lastAppPath: null,
          avatarStoragePath: null,
        },
      }),
    ]);
  }

  async clearUserAvatar(userId: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStoragePath: true },
    });
    const prev = existing?.avatarStoragePath?.trim() ?? '';
    if (prev) await this.gcs.delete(prev);
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarStoragePath: null },
    });
  }

  private issueTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
        '30d',
      ) as StringValue,
    });
    return { accessToken, refreshToken };
  }
}
