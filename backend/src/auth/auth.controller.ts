import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Patch,
  Delete,
  Headers,
  Req,
  UseGuards,
  Get,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SyncSupabaseDto } from './dto/sync-supabase.dto.js';
import { SendOtpDto } from './dto/send-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { UpdateAvatarDto } from './dto/update-avatar.dto.js';
import { UpdateTourDto } from './dto/update-tour.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import type { User } from '@prisma/client';
import { AuthTokens } from './interfaces/auth-tokens.interface.js';

interface JwtRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public()
  @Post('register')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async register(
    @Body()
    dto: RegisterDto,
    @Ip()
    ip: string,
    @Headers('user-agent')
    userAgent: string,
  ): Promise<AuthTokens> {
    return this.authService.register(dto, { ip, userAgent });
  }
  @Public()
  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @HttpCode(HttpStatus.OK)
  async login(
    @Body()
    dto: LoginDto,
    @Ip()
    ip: string,
    @Headers('user-agent')
    userAgent: string,
  ): Promise<AuthTokens> {
    return this.authService.login(dto, { ip, userAgent });
  }
  @Public()
  @Post('sync-supabase')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @HttpCode(HttpStatus.OK)
  syncSupabase(
    @Headers('authorization')
    authorization: string | undefined,
    @Body()
    dto: SyncSupabaseDto,
  ): Promise<AuthTokens> {
    const prismaRole: PrismaRole =
      dto.role === 'clinic' ? PrismaRole.HOST : PrismaRole.LOCUM;
    return this.authService.syncFromSupabaseToken(authorization, prismaRole);
  }
  @Public()
  @Post('send-otp')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto): Promise<{ success: true }> {
    const prismaRole: PrismaRole =
      dto.role === 'clinic' ? PrismaRole.HOST : PrismaRole.LOCUM;
    await this.authService.sendOtp(dto.email, prismaRole);
    return { success: true };
  }

  @Public()
  @Post('verify-otp')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
  ): Promise<AuthTokens> {
    const prismaRole: PrismaRole =
      dto.role === 'clinic' ? PrismaRole.HOST : PrismaRole.LOCUM;
    return this.authService.verifyOtp(dto.email, dto.otp, prismaRole, ip);
  }
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(
    @CurrentUser()
    user: User,
  ) {
    return this.authService.presentMe(user);
  }
  @Patch('me/tour')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @HttpCode(HttpStatus.OK)
  async markTourSeen(
    @CurrentUser()
    user: User,
    @Body()
    dto: UpdateTourDto,
  ): Promise<{ success: true }> {
    await this.authService.markTourSeen(user.id, dto.tourKey);
    return { success: true };
  }
  @Patch('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @HttpCode(HttpStatus.OK)
  async updateAvatar(
    @CurrentUser()
    user: User,
    @Body()
    dto: UpdateAvatarDto,
  ): Promise<{
    success: true;
  }> {
    await this.authService.setUserAvatarStoragePath(user.id, dto.storagePath);
    return { success: true };
  }
  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async clearAvatar(
    @CurrentUser()
    user: User,
  ): Promise<{
    success: true;
  }> {
    await this.authService.clearUserAvatar(user.id);
    return { success: true };
  }
  @Post('me/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Req() req: JwtRequest) {
    return this.authService.deactivateAccount(req.user.id);
  }

  @Delete('me/permanent-delete')
  @HttpCode(HttpStatus.OK)
  permanentDelete(@Req() req: JwtRequest) {
    return this.authService.permanentDeleteAccount(req.user.id);
  }
}
