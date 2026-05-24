import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Patch, Delete, Headers, UseGuards, Get, UsePipes, ValidationPipe, } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SyncSupabaseDto } from './dto/sync-supabase.dto.js';
import { UpdateAvatarDto } from './dto/update-avatar.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import type { User } from '@prisma/client';
import { AuthTokens } from './interfaces/auth-tokens.interface.js';
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }
    @Public()
    @Post('register')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    async register(
    @Body()
    dto: RegisterDto, 
    @Ip()
    ip: string, 
    @Headers('user-agent')
    userAgent: string): Promise<AuthTokens> {
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
    userAgent: string): Promise<AuthTokens> {
        return this.authService.login(dto, { ip, userAgent });
    }
    @Public()
    @Post('sync-supabase')
    @HttpCode(HttpStatus.OK)
    syncSupabase(
    @Headers('authorization')
    authorization: string | undefined, 
    @Body()
    dto: SyncSupabaseDto): Promise<AuthTokens> {
        const prismaRole: PrismaRole = dto.role === 'clinic' ? PrismaRole.HOST : PrismaRole.LOCUM;
        return this.authService.syncFromSupabaseToken(authorization, prismaRole);
    }
    @Public()
    @Post('dev-otp-login')
    @HttpCode(HttpStatus.OK)
    devOtpLogin(
    @Body()
    dto: {
        email?: string;
        role?: 'locum' | 'clinic';
    }): Promise<AuthTokens> {
        const prismaRole: PrismaRole = dto.role === 'clinic' ? PrismaRole.HOST : PrismaRole.LOCUM;
        return this.authService.devOtpLogin(dto.email, prismaRole);
    }
    @Get('me')
    @UseGuards(JwtAuthGuard)
    getMe(
    @CurrentUser()
    user: User) {
        return this.authService.presentMe(user);
    }
    @Patch('me/avatar')
    @UseGuards(JwtAuthGuard)
    @UsePipes(new ValidationPipe({ whitelist: true }))
    @HttpCode(HttpStatus.OK)
    async updateAvatar(
    @CurrentUser()
    user: User, 
    @Body()
    dto: UpdateAvatarDto): Promise<{
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
    user: User): Promise<{
        success: true;
    }> {
        await this.authService.clearUserAvatar(user.id);
        return { success: true };
    }
    @Post('me/deactivate')
    @Delete('me/permanent-delete')
@UseGuards(JwtAuthGuard)
async permanentDeleteAccount(
    @CurrentUser() user: User,
) {
    await this.authService.permanentDeleteAccount(user.id);
    return { ok: true };
}
   
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    async deactivateAccount(
    @CurrentUser()
    user: User,
    @Ip()
    ip: string,
    @Headers('user-agent')
    userAgent: string): Promise<{
        success: true;
    }> {
        await this.authService.deactivateAccount(user.id, { ip, userAgent });
        return { success: true };
    }
}
