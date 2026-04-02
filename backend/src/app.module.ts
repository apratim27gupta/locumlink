import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validate } from './config/env.validation.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '..', `.env.${process.env.NODE_ENV || 'staging'}`),
        join(__dirname, '..', '..', '.env'),
        join(__dirname, '..', `.env.${process.env.NODE_ENV || 'staging'}`),
        join(__dirname, '..', '.env'),
      ],
      validate,
    }),
    PrismaModule, // @Global — available everywhere
    AuditModule, // @Global — available everywhere
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
