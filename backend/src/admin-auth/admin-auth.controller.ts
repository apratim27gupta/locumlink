import { Body, Controller, Get, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import type { AdminJwtPayload } from './admin-auth.types.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { AdminAuthService } from './admin-auth.service.js';
import { ADMIN_GOOGLE_STRATEGY, resolveAdminGoogleCallbackUrl } from './admin-auth.constants.js';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard.js';
import { AdminGoogleEnabledGuard } from './guards/admin-google-enabled.guard.js';
import { RedirectAdminOAuthToLoginFilter } from './filters/redirect-admin-oauth-login.filter.js';
import { CurrentAdmin } from './decorators/current-admin.decorator.js';

@Public()
@Controller('admin-auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async emailLogin(
    @Body() body: { email?: string },
    @Res() res: Response,
  ) {
    const u = await this.adminAuth.loginWithEmail(body.email ?? '');
    const token = await this.adminAuth.signAdminJwt({
      adminId: u.adminId,
      email: u.email,
    });
    this.adminAuth.setAdminSessionCookie(res, token);
    return res.status(200).json({
      ok: true,
      redirect: this.adminAuth.getFrontendRedirectUrl(),
    });
  }

  /** Legacy Google OAuth — disabled in UI; use POST /admin-auth/login instead. */
  @Get('oauth-setup')
  oauthSetup() {
    const callbackUrl = resolveAdminGoogleCallbackUrl(this.config);
    const frontendRedirect = this.adminAuth.getFrontendRedirectUrl();
    return {
      callbackUrl,
      frontendRedirect,
      allowedEmail: this.adminAuth.getAllowedAdminEmail(),
      googleCloudHint:
        'APIs & Services → Credentials → your OAuth client → Authorized redirect URIs → paste callbackUrl exactly.',
    };
  }

  @Get('google')
  @UseGuards(AdminGoogleEnabledGuard, AuthGuard(ADMIN_GOOGLE_STRATEGY))
  googleAuth(): void {
    /* Passport issues HTTP redirect */
  }

  @Get('google/callback')
  @UseFilters(RedirectAdminOAuthToLoginFilter)
  @UseGuards(AdminGoogleEnabledGuard, AuthGuard(ADMIN_GOOGLE_STRATEGY))
  async googleAuthCallback(
    @Req() req: { user: { adminId: string; email: string } },
    @Res() res: Response,
  ) {
    const u = req.user;
    const token = await this.adminAuth.signAdminJwt({
      adminId: u.adminId,
      email: u.email,
    });

    this.adminAuth.setAdminSessionCookie(res, token);

    return res.redirect(this.adminAuth.getFrontendRedirectUrl());
  }

  @Get('logout')
  async logout(@Res() res: Response) {
    res.clearCookie(this.adminAuth.getCookieName(), { path: '/' });
    return res.status(200).json({ ok: true });
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async me(@CurrentAdmin() admin: AdminJwtPayload) {
    return { admin };
  }
}
