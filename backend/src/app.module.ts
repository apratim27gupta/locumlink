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
import { FeedbackModule } from './feedback/feedback.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { backendDevelopmentEnvPaths } from './config/backend-env-files.js';
import { validate } from './config/env.validation.js';
import { AdminAuthModule } from './admin-auth/admin-auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ErrorLogInterceptor } from './common/error-log.interceptor.js';
import { AppLoggerModule } from './common/logger/app-logger.module.js';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor.js';
import { AppLoggerService } from './common/logger/app-logger.service.js';
@Module({
  imports: [
    AppLoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? []
          : backendDevelopmentEnvPaths(),
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
    FeedbackModule,
    NotificationsModule,
    UploadModule,
    GcsModule,
    AdminAuthModule,
    AdminModule,
    SchedulerModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
})
export class AppModule {}
