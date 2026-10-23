import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  bindPgPool,
  bindWorkPending,
  digestDueCutoff,
  stuckWorkCutoff,
  type WorkPending,
} from './app-metrics.js';

@Injectable()
export class AppMetricsBinder implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    bindPgPool(this.prisma.poolForTelemetry());
    bindWorkPending(() => this.readPending());
  }

  private async readPending(): Promise<WorkPending> {
    const stuckBefore = stuckWorkCutoff();
    const digestBefore = digestDueCutoff();
    const [emailDigest, stripeCheckout, stripeRefund] = await Promise.all([
      this.countDueDigests(digestBefore),
      this.prisma.matchFeePaymentAttempt.count({
        where: {
          status: 'OPEN',
          stripeCheckoutSessionId: { not: null },
          createdAt: { lt: stuckBefore },
        },
      }),
      this.prisma.matchFeeRefund.count({
        where: {
          status: { in: ['REQUESTED', 'PENDING'] },
          stripePaymentIntentId: { not: null },
          updatedAt: { lt: stuckBefore },
        },
      }),
    ]);
    return {
      email_digest: emailDigest,
      stripe_checkout: stripeCheckout,
      stripe_refund: stripeRefund,
    };
  }

  private async countDueDigests(dueBefore: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE email_digest_state IS NOT NULL
        AND (
          (
            (email_digest_state->'applications'->>'lastPendingAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
            AND (email_digest_state->'applications'->>'lastPendingAt') <= ${dueBefore.toISOString()}
          )
          OR (
            (email_digest_state->'messages'->>'lastPendingAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
            AND (email_digest_state->'messages'->>'lastPendingAt') <= ${dueBefore.toISOString()}
          )
        )
    `;
    return Number(rows[0]?.count ?? 0);
  }
}
