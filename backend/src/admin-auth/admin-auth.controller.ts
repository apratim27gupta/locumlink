import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard.js';
import { CurrentAdmin } from './decorators/current-admin.decorator.js';
import type { AdminJwtPayload } from './admin-auth.types.js';
import {
  AdminRequestOtpDto,
  AdminVerifyOtpDto,
} from './dto/admin-auth.dto.js';

@Public()
@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async requestOtp(@Body() body: AdminRequestOtpDto, @Ip() ip: string) {
    await this.adminAuth.requestLoginOtp(body.email, ip);
    return { ok: true, message: this.adminAuth.otpRequestGenericMessage() };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async verifyOtp(
    @Body() body: AdminVerifyOtpDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = await this.adminAuth.verifyLoginOtp(body.email, body.otp, ip);
    const token = await this.adminAuth.signAdminJwt({
      adminId: u.adminId,
      email: u.email,
    });
    this.adminAuth.setAdminSessionCookie(res, token);
    return {
      ok: true,
      redirect: this.adminAuth.getFrontendRedirectUrl(),
    };
  }

  @Get('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(this.adminAuth.getCookieName(), { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async me(@CurrentAdmin() admin: AdminJwtPayload) {
    const fresh = await this.adminAuth.loadAdminSessionUser(admin.sub);
    return { admin: fresh };
  }
}
