import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service.js';
import { AppMetricsBinder } from '../telemetry/app-metrics.binder.js';
@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, AppMetricsBinder],
  exports: [PrismaService],
})
export class PrismaModule {}
