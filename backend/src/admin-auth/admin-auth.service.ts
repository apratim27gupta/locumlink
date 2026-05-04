import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { ADMIN_AUTH_COOKIE } from './admin-auth.constants.js';
import type { AdminJwtPayload } from './admin-auth.types.js';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async assertEmailIsAllowedAdmin(email?: string | null) {
    if (!email) throw new UnauthorizedException('Google account email missing');
    const admin = await this.prisma.admin.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!admin) {
      throw new ForbiddenException('This Google account is not allowed as an admin');
    }
    return admin;
  }

  async signAdminJwt(params: { adminId: string; email: string }): Promise<string> {
    const payload: AdminJwtPayload = { sub: params.adminId, email: params.email, role: 'admin' };
    return this.jwt.signAsync(payload);
  }

  getFrontendRedirectUrl() {
    return this.config.get<string>('ADMIN_FRONTEND_REDIRECT_URL', 'http://localhost:3001/admin/dashboard');
  }

  getCookieName() {
    return ADMIN_AUTH_COOKIE;
  }
}

