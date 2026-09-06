import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<Record<string, unknown>> {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      dbStatus = 'unreachable';
    }
    const healthy = dbStatus === 'ok';
    return {
      status: healthy ? 'ok' : 'degraded',
      environment: this.config.get<string>('NODE_ENV'),
      database: dbStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
