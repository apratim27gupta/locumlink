import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { ADMIN_AUTH_COOKIE, ADMIN_AUTH_COOKIE_OPTS } from './admin-auth.constants.js';
import type { Response } from 'express';
import type { AdminJwtPayload } from './admin-auth.types.js';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  getAllowedAdminEmail(): string {
    return this.config
      .get<string>('ADMIN_ALLOWED_EMAIL', 'aroradamini873@gmail.com')
      .trim()
      .toLowerCase();
  }

  async assertEmailIsAllowedAdmin(email?: string | null) {
    if (!email)
      throw new UnauthorizedException('Signed-in account has no email');
    const normalized = email.trim().toLowerCase();
    if (normalized !== this.getAllowedAdminEmail())
      throw new ForbiddenException('This account is not allowed as an admin');
    const admin = await this.prisma.admin.findUnique({
      where: { email: normalized },
    });
    if (!admin)
      throw new ForbiddenException('This account is not allowed as an admin');
    return admin;
  }

  async loginWithEmail(rawEmail: string): Promise<{ adminId: string; email: string }> {
    const email = rawEmail.trim().toLowerCase();
    if (!email || !email.includes('@'))
      throw new UnauthorizedException('Enter a valid email address');
    if (email !== this.getAllowedAdminEmail())
      throw new ForbiddenException('This email is not authorized for admin access');
    const admin = await this.prisma.admin.upsert({
      where: { email },
      update: {},
      create: { email, name: 'Admin', role: 'admin' },
    });
    return { adminId: admin.id, email: admin.email };
  }

  setAdminSessionCookie(res: Response, token: string) {
    res.cookie(this.getCookieName(), token, {
      ...ADMIN_AUTH_COOKIE_OPTS,
      maxAge: this.parseAdminJwtCookieMaxAgeMs(),
    });
  }

  async signAdminJwt(params: { adminId: string; email: string }): Promise<string> {
    const payload: AdminJwtPayload = { sub: params.adminId, email: params.email, role: 'admin' };
    return this.jwt.signAsync(payload);
  }

  /** Cookie `maxAge` in ms from ADMIN_JWT_EXPIRES_IN */
  parseAdminJwtCookieMaxAgeMs(): number {
    const raw = this.config.get<string>('ADMIN_JWT_EXPIRES_IN', '7d');
    const match = /^(\d+)([smhd])$/.exec(raw.trim());
    if (!match)
      return 7 * 24 * 60 * 60 * 1000;
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
    return this.config.get<string>('ADMIN_FRONTEND_REDIRECT_URL', 'http://localhost:3002/admin/dashboard');
  }

  /** Origin derived from ADMIN_FRONTEND_REDIRECT_URL so login links stay in sync. */
  getFrontendOrigin(): string {
    try {
      return new URL(this.getFrontendRedirectUrl()).origin;
    }
    catch {
      return 'http://localhost:3002';
    }
  }

  buildAdminLoginUrl(error: 'oauth' | 'not_allowed', reason: string): string {
    const u = new URL(`${this.getFrontendOrigin()}/admin/login`);
    u.searchParams.set('error', error);
    if (reason)
      u.searchParams.set('reason', reason);
    return u.toString();
  }

  getCookieName() {
    return ADMIN_AUTH_COOKIE;
  }
}
