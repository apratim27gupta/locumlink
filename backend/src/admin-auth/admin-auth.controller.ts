import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { AdminAuthService } from './admin-auth.service.js';
import { ADMIN_AUTH_COOKIE_OPTS } from './admin-auth.constants.js';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard.js';
import { CurrentAdmin } from './decorators/current-admin.decorator.js';
import type { AdminJwtPayload } from './admin-auth.types.js';
import { GoogleAdminGuard } from './guards/google-admin.guard.js';

@Controller('admin-auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('google')
  @UseGuards(GoogleAdminGuard)
  async googleStart() {
    // Redirects to Google automatically.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAdminGuard)
  async googleCallback(
    @Req() req: Request & { user?: { email?: string; name?: string } },
    @Res() res: Response,
  ) {
    const email = req.user?.email?.toLowerCase();
    try {
      const admin = await this.adminAuth.assertEmailIsAllowedAdmin(email);
      const token = await this.adminAuth.signAdminJwt({ adminId: admin.id, email: admin.email });

      res.cookie(this.adminAuth.getCookieName(), token, {
        ...ADMIN_AUTH_COOKIE_OPTS,
        maxAge: this.parseExpiresToMs(),
      });

      return res.redirect(this.adminAuth.getFrontendRedirectUrl());
    } catch (e) {
      const raw = this.config.get<string>('ALLOWED_ORIGINS', 'http://localhost:3001');
      const origin = raw.split(',')[0]?.trim() || 'http://localhost:3001';
      return res.redirect(`${origin.replace(/\/$/, '')}/admin/login?error=not_allowed`);
    }
  }

  @Public()
  @Get('logout')
  async logout(@Res() res: Response) {
    res.clearCookie(this.adminAuth.getCookieName(), { path: '/' });
    return res.status(200).json({ ok: true });
  }

  // Simple "am I logged in?" endpoint for admin UI.
  @Public()
  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async me(@CurrentAdmin() admin: AdminJwtPayload) {
    return { admin };
  }

  private parseExpiresToMs() {
    // ADMIN_JWT_EXPIRES_IN supports formats like "7d", "12h".
    // For cookie maxAge, we’ll approximate only the common suffixes used here.
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
}

