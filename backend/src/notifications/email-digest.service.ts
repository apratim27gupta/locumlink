import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from './email.service.js';
import { allowsEmailForEvent } from './email-prefs.js';
import type { DigestEventType } from './email-digest.js';
import {
  DIGEST_FLUSH_COUNT,
  DIGEST_FLUSH_DELAY_MS,
  buildDigestEmail,
  digestCategoryForEventType,
  digestFlushAnchor,
  eventTypesForDigestCategory,
  getCategoryDigestState,
  parseEmailDigestState,
  type DigestCategory,
  type EmailDigestState,
} from './email-digest.js';

@Injectable()
export class EmailDigestService {
  private readonly logger = new Logger(EmailDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Queue a digest-eligible event; flush immediately when count threshold is hit. */
  async afterDigestibleEvent(params: {
    recipientId: string;
    eventType: DigestEventType;
    emailTo?: string;
  }): Promise<void> {
    const category = digestCategoryForEventType(params.eventType);
    if (!category) return;

    const user = await this.prisma.user.findUnique({
      where: { id: params.recipientId },
      select: { emailPrefs: true, emailDigestState: true },
    });
    if (!user) return;
    if (!allowsEmailForEvent(user.emailPrefs, params.eventType)) return;

    const state = parseEmailDigestState(user.emailDigestState);
    const categoryState = getCategoryDigestState(state, category);
    const nowIso = new Date().toISOString();
    const nextState: EmailDigestState = {
      ...state,
      [category]: {
        ...categoryState,
        lastPendingAt: nowIso,
      },
    };
    await this.prisma.user.update({
      where: { id: params.recipientId },
      data: { emailDigestState: nextState as Prisma.InputJsonValue },
    });

    const pendingCount = await this.countPending(
      params.recipientId,
      category,
      categoryState.lastDigestFlushedAt,
    );
    if (pendingCount >= DIGEST_FLUSH_COUNT) {
      await this.flushDigest(params.recipientId, category, params.emailTo);
    }
  }

  /** Discard pending digest items when a category toggle is turned off. */
  async discardPending(
    recipientId: string,
    category: DigestCategory,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { emailDigestState: true },
    });
    if (!user) return;

    const state = parseEmailDigestState(user.emailDigestState);
    const nowIso = new Date().toISOString();
    await this.prisma.user.update({
      where: { id: recipientId },
      data: {
        emailDigestState: {
          ...state,
          [category]: {
            lastDigestFlushedAt: nowIso,
            lastPendingAt: null,
          },
        } as Prisma.InputJsonValue,
      },
    });
  }

  /** Flush digests whose rolling 24h timer has elapsed. */
  async flushDueDigests(): Promise<void> {
    const cutoff = Date.now() - DIGEST_FLUSH_DELAY_MS;
    const users = await this.prisma.user.findMany({
      where: { emailDigestState: { not: Prisma.DbNull } },
      select: {
        id: true,
        email: true,
        role: true,
        emailPrefs: true,
        emailDigestState: true,
      },
    });

    for (const user of users) {
      const state = parseEmailDigestState(user.emailDigestState);
      for (const category of ['applications', 'messages'] as const) {
        const categoryState = getCategoryDigestState(state, category);
        if (!categoryState.lastPendingAt) continue;
        if (new Date(categoryState.lastPendingAt).getTime() > cutoff) continue;

        const sampleEventType =
          category === 'applications'
            ? 'L_001_NEW_OPPORTUNITY'
            : 'L_008_NEW_MESSAGE';
        if (!allowsEmailForEvent(user.emailPrefs, sampleEventType)) continue;

        try {
          await this.flushDigest(user.id, category, user.email);
        } catch (err) {
          this.logger.error(
            `Digest flush failed for ${user.id} (${category})`,
            err,
          );
        }
      }
    }
  }

  async flushDigest(
    recipientId: string,
    category: DigestCategory,
    emailTo?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: {
        email: true,
        role: true,
        emailPrefs: true,
        emailDigestState: true,
      },
    });
    if (!user) return;

    const sampleEventType =
      category === 'applications'
        ? 'L_001_NEW_OPPORTUNITY'
        : 'L_008_NEW_MESSAGE';
    if (!allowsEmailForEvent(user.emailPrefs, sampleEventType)) return;

    const state = parseEmailDigestState(user.emailDigestState);
    const categoryState = getCategoryDigestState(state, category);
    const anchor = digestFlushAnchor(categoryState);

    const items = await this.prisma.notificationEvent.findMany({
      where: {
        recipientId,
        eventType: { in: eventTypesForDigestCategory(category) },
        emailDigestIncludedAt: null,
        sentAt: { gt: anchor },
      },
      orderBy: { sentAt: 'asc' },
      take: 100,
      select: { id: true, payload: true },
    });

    if (items.length === 0) {
      await this.clearPendingTimer(recipientId, category, state);
      return;
    }

    const to = emailTo?.trim() || user.email;
    const { subject, text } = buildDigestEmail({
      category,
      role: user.role,
      items,
    });

    const emailResult = await this.email.send({ to, subject, text });
    if (!emailResult.ok) {
      this.logger.error(
        `Digest email failed for ${to} (${category}): ${emailResult.error}`,
      );
      return;
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notificationEvent.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data: { emailDigestIncludedAt: now },
      }),
      this.prisma.user.update({
        where: { id: recipientId },
        data: {
          emailDigestState: {
            ...state,
            [category]: {
              lastDigestFlushedAt: now.toISOString(),
              lastPendingAt: null,
            },
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
  }

  private async countPending(
    recipientId: string,
    category: DigestCategory,
    lastDigestFlushedAt: string | null,
  ): Promise<number> {
    const anchor = digestFlushAnchor({
      lastDigestFlushedAt,
      lastPendingAt: null,
    });
    return this.prisma.notificationEvent.count({
      where: {
        recipientId,
        eventType: { in: eventTypesForDigestCategory(category) },
        emailDigestIncludedAt: null,
        sentAt: { gt: anchor },
      },
    });
  }

  private async clearPendingTimer(
    recipientId: string,
    category: DigestCategory,
    state: EmailDigestState,
  ): Promise<void> {
    const categoryState = getCategoryDigestState(state, category);
    await this.prisma.user.update({
      where: { id: recipientId },
      data: {
        emailDigestState: {
          ...state,
          [category]: {
            ...categoryState,
            lastPendingAt: null,
          },
        } as Prisma.InputJsonValue,
      },
    });
  }
}
