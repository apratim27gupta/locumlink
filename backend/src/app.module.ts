import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { GcsModule } from './gcs/gcs.module.js';
import { UploadModule } from './upload/upload.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AuditModule } from './audit/audit.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { HostModule } from './host/host.module.js';
import { LocumModule } from './locum/locum.module.js';
import { MessageModule } from './message/message.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { validate } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'staging'}`, '.env'],
      validate,
    }),
    GcsModule,
    AuditModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    HostModule,
    LocumModule,
    MessageModule,
    NotificationsModule,
    UploadModule,
    GcsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
