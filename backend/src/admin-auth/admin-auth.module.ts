import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { GoogleAdminStrategy } from './strategies/google-admin.strategy.js';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADMIN_JWT_SECRET') ?? config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('ADMIN_JWT_EXPIRES_IN', '7d') as any },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, GoogleAdminStrategy, AdminJwtStrategy],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}

