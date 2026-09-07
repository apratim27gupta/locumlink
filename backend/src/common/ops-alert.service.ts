import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import {
  DEFAULT_SLOW_API_THRESHOLD_MS,
  HEALTH_CHECK_LOG_PREFIX,
  SLOW_API_LOG_PREFIX,
  isNoiseError,
  shouldOpsAlert,
} from './ops-alert.constants.js';

export type OpsErrorLogInput = {
  userId?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode: number;
  message: string;
  stack?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  getSlowApiThresholdMs(): number {
    const raw = this.config.get<string>('API_SLOW_THRESHOLD_MS');
    const parsed = raw ? parseInt(raw, 10) : DEFAULT_SLOW_API_THRESHOLD_MS;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_SLOW_API_THRESHOLD_MS;
  }

  parseAdminEmails(): string[] {
    const raw = this.config.get<string>('ADMIN_ALERT_EMAIL') ?? '';
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }

  async recordError(input: OpsErrorLogInput): Promise<void> {
    if (isNoiseError(input.statusCode, input.message)) return;

    try {
      const row = await this.prisma.errorLog.create({
        data: {
          userId: input.userId ?? null,
          route: input.route ?? null,
          method: input.method ?? null,
          statusCode: input.statusCode,
          message: input.message,
          stack: input.stack ?? null,
          metadata: input.metadata ?? undefined,
          alerted: false,
        },
      });

      if (!shouldOpsAlert(input.statusCode, input.message)) return;

      const admins = this.parseAdminEmails();
      if (admins.length === 0) return;

      const subject = `Server Error [${input.statusCode}] — ${input.method ?? '?'} ${input.route ?? '?'}`;
      const text = [
        `Error: ${input.message}`,
        `User ID: ${input.userId ?? 'unauthenticated'}`,
        `Route: ${input.method ?? '?'} ${input.route ?? '?'}`,
        `Time: ${new Date().toISOString()}`,
        `Stack:\n${input.stack ?? 'N/A'}`,
      ].join('\n');

      await Promise.all(
        admins.map((to) =>
          this.email.send({ to, subject, text }).catch((e) => {
            this.logger.error(`[OpsAlert] Email to ${to} failed: ${e}`);
          }),
        ),
      );

      await this.prisma.errorLog.update({
        where: { id: row.id },
        data: { alerted: true },
      });
    } catch (err) {
      this.logger.error(`[OpsAlert] Failed to record error: ${err}`);
    }
  }

  async recordSlowRequest(params: {
    userId?: string | null;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
  }): Promise<void> {
    const threshold = this.getSlowApiThresholdMs();
    if (params.durationMs < threshold) return;
    if (params.path.includes('/health')) return;

    await this.recordError({
      userId: params.userId ?? null,
      route: params.path,
      method: params.method,
      statusCode: params.statusCode,
      message: `${SLOW_API_LOG_PREFIX} ${params.method} ${params.path} took ${params.durationMs}ms (threshold ${threshold}ms)`,
      metadata: { durationMs: params.durationMs, thresholdMs: threshold },
    });
  }

  async recordHealthFailure(detail: string): Promise<void> {
    await this.recordError({
      statusCode: 503,
      message: `${HEALTH_CHECK_LOG_PREFIX} ${detail}`,
      route: '/api/health',
      method: 'GET',
    });
  }
}
