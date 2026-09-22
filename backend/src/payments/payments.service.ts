import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  MatchFeeCancelledBy,
  MatchFeeInvoiceEventActor,
  MatchFeeInvoiceEventType,
  MatchFeeInvoiceStatus,
  MatchFeeRefundResolution,
  MatchFeeReplacementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import {
  MATCH_FEE_CURRENCY,
  MATCH_FEE_POLICY,
  MATCH_FEE_CANCELLATION_WINDOW_DAYS,
  computeMatchFeeAmountCents,
  matchFeeTierFromHours,
} from './match-fee.constants.js';
import {
  computeDueAt,
  computeEarliestShiftDate,
  daysUntilCalendarDate,
  evaluateCancellationPolicy,
  isEscalationDue,
  type CancellationActor,
} from './match-fee-cancellation.util.js';
import {
  buildMatchFeeInvoiceTimeline,
  MATCH_FEE_STATUS_ADMIN_GUIDE,
} from './match-fee-invoice.presentation.js';
import {
  cancellationActorToEventActor,
  mergeMatchFeeEvents,
  type MatchFeeInvoiceEventDto,
} from './match-fee-invoice.events.js';
import { buildMatchFeeReceiptPdf } from './match-fee-receipt.pdf.js';
import { StripeService } from './stripe.service.js';
import type Stripe from 'stripe';
import {
  computeApplicationClaimedHours,
  getPostingRequiredDates,
  platformCalendarDateOf,
  platformCalendarDateToday,
} from '../host/job-schedule.util.js';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

const invoiceInclude = {
  application: {
    select: {
      id: true,
      status: true,
      locumAcceptedAt: true,
      availabilityKind: true,
      availableDates: true,
      requestedShiftIds: true,
      locumProfile: {
        select: {
          firstName: true,
          lastName: true,
          userId: true,
        },
      },
      shiftClaims: { select: { shiftId: true } },
    },
  },
  jobPosting: {
    select: {
      id: true,
      title: true,
      location: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      scheduleModel: true,
      shifts: {
        select: {
          id: true,
          date: true,
          shiftType: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  },
} satisfies Prisma.MatchFeeInvoiceInclude;

const invoiceIncludeWithEvents = {
  ...invoiceInclude,
  events: { orderBy: { occurredAt: 'asc' as const } },
} satisfies Prisma.MatchFeeInvoiceInclude;

function formatPostingScheduleLabel(
  posting: Prisma.JobPostingGetPayload<{
    select: {
      startDate: true;
      endDate: true;
      shifts: { select: { date: true } };
    };
  }>,
): string | null {
  const days = getPostingRequiredDates(posting);
  if (days.length === 0) return null;
  if (days.length === 1) return days[0];
  if (days.length <= 4) return days.join(', ');
  return `${days[0]} to ${days[days.length - 1]} (${days.length} days)`;
}

export type MatchFeeInvoiceDto = {
  id: string;
  applicationId: string;
  jobPostingId: string;
  amountCents: number;
  claimedHours: number | null;
  matchFeeTier: string | null;
  currency: string;
  status: MatchFeeInvoiceStatus;
  dueAt: string;
  paidAt: string | null;
  mockPaymentRef: string | null;
  cancelledAt: string | null;
  cancelledBy: MatchFeeCancelledBy | null;
  cancellationReason: string | null;
  refundResolution: MatchFeeRefundResolution;
  replacementStatus: MatchFeeReplacementStatus;
  escalatedAt: string | null;
  createdAt: string;
  jobTitle: string;
  postingLocation: string | null;
  postingScheduleLabel: string | null;
  locumName: string;
  daysUntilStart: number | null;
  events: MatchFeeInvoiceEventDto[];
};

function formatLocumName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Locum';
}

function mapInvoice(
  row: Prisma.MatchFeeInvoiceGetPayload<{
    include: typeof invoiceIncludeWithEvents;
  }>,
): MatchFeeInvoiceDto {
  const earliest = computeEarliestShiftDate(row.jobPosting, row.application);
  return {
    id: row.id,
    applicationId: row.applicationId,
    jobPostingId: row.jobPostingId,
    amountCents: row.amountCents,
    claimedHours:
      row.claimedHours != null ? Number(row.claimedHours) : null,
    matchFeeTier: row.matchFeeTier ?? null,
    currency: row.currency,
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    mockPaymentRef: row.mockPaymentRef,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledBy: row.cancelledBy,
    cancellationReason: row.cancellationReason,
    refundResolution: row.refundResolution,
    replacementStatus: row.replacementStatus,
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    jobTitle: row.jobPosting.title,
    postingLocation: row.jobPosting.location?.trim() || null,
    postingScheduleLabel: formatPostingScheduleLabel(row.jobPosting),
    locumName: formatLocumName(
      row.application.locumProfile.firstName,
      row.application.locumProfile.lastName,
    ),
    daysUntilStart: daysUntilCalendarDate(earliest),
    events: mergeMatchFeeEvents(row.events ?? [], row),
  };
}

function mapAdminInvoice(
  row: Prisma.MatchFeeInvoiceGetPayload<{
    include: typeof invoiceInclude & {
      hostProfile: {
        select: {
          id: true;
          practiceName: true;
          matchFeeReviewRequired: true;
          user: { select: { id: true; email: true } };
        };
      };
    };
  }>,
) {
  const base = mapInvoice(row);
  const statusGuide = MATCH_FEE_STATUS_ADMIN_GUIDE.find(
    (g) => g.status === row.status,
  );
  const timeline = buildMatchFeeInvoiceTimeline({
    status: row.status,
    createdAt: row.createdAt,
    dueAt: row.dueAt,
    paidAt: row.paidAt,
    jobPosting: row.jobPosting,
    application: row.application,
  });
  return {
    ...base,
    hostProfileId: row.hostProfileId,
    hostPracticeName: row.hostProfile.practiceName,
    hostEmail: row.hostProfile.user?.email ?? null,
    hostUserId: row.hostProfile.user?.id ?? null,
    matchFeeReviewRequired: row.hostProfile.matchFeeReviewRequired,
    adminNotes: row.adminNotes,
    paymentProvider: row.paymentProvider,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    statusGuide: statusGuide ?? null,
    timeline,
    events: base.events,
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly adminNotifications: AdminNotificationsService,
    private readonly stripeService: StripeService,
  ) {}

  getPolicy(role: 'HOST' | 'LOCUM') {
    const paymentMethods = this.stripeService.getPublicConfig();
    return {
      role,
      ...MATCH_FEE_POLICY,
      paymentMethods,
      emphasis:
        role === 'LOCUM'
          ? 'LocumLink is free for locums. The host pays a match fee ($125 or $250 CAD) after you accept a confirmed placement, based on total hours claimed.'
          : 'Free to post. Free to review applicants. Pay $125 or $250 per matched locum when they accept your confirmed match (based on total hours claimed).',
    };
  }

  private async recordMatchFeeEvent(
    invoiceId: string,
    eventType: MatchFeeInvoiceEventType,
    params?: {
      detail?: string | null;
      actor?: MatchFeeInvoiceEventActor;
      occurredAt?: Date;
    },
  ): Promise<void> {
    await this.prisma.matchFeeInvoiceEvent.create({
      data: {
        invoiceId,
        eventType,
        detail: params?.detail ?? undefined,
        actor: params?.actor ?? 'SYSTEM',
        occurredAt: params?.occurredAt,
      },
    });
  }

  private async processRefund(params: {
    invoiceId: string;
    reason?: string | null;
    cancelledBy?: MatchFeeCancelledBy;
    adminNotes?: string | null;
    notifyHost?: boolean;
  }): Promise<void> {
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: params.invoiceId },
      include: {
        jobPosting: { select: { title: true, hostProfileId: true } },
        hostProfile: {
          select: { userId: true, user: { select: { email: true } } },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'REFUNDED') return;

    const wasCollected =
      invoice.paidAt != null ||
      invoice.status === 'PAID' ||
      invoice.status === 'PENDING_REPLACEMENT';

    let stripeRefundId = invoice.stripeRefundId;
    if (
      wasCollected &&
      invoice.paymentProvider === 'STRIPE' &&
      invoice.stripePaymentIntentId &&
      !stripeRefundId
    ) {
      stripeRefundId = await this.stripeService.refundMatchFeePayment({
        paymentIntentId: invoice.stripePaymentIntentId,
        amountCents: invoice.amountCents,
        invoiceId: invoice.id,
      });
    }

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoice.id },
      data: {
        status: 'REFUNDED',
        refundResolution: 'REFUND',
        stripeRefundId,
        cancelledAt: new Date(),
        cancelledBy: params.cancelledBy ?? 'ADMIN',
        cancellationReason: params.reason ?? invoice.cancellationReason,
        adminNotes: params.adminNotes ?? invoice.adminNotes,
      },
    });

    await this.recordMatchFeeEvent(invoice.id, 'REFUNDED', {
      detail: stripeRefundId
        ? `Refunded to original payment method (Stripe ${stripeRefundId}).`
        : wasCollected
          ? 'Refunded (no Stripe charge on file).'
          : 'Refund recorded.',
      actor: cancellationActorToEventActor(params.cancelledBy ?? 'ADMIN'),
    });

    const host = invoice.hostProfile;
    if (
      params.notifyHost !== false &&
      wasCollected &&
      host?.userId &&
      host.user?.email
    ) {
      await this.notifications.notifyHostMatchFeeRefund({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: invoice.jobPosting.title,
        invoiceId: invoice.id,
      });
    }

    await this.syncHostReviewFlag(invoice.jobPosting.hostProfileId);
  }

  async createMatchFeeInvoice(applicationId: string): Promise<void> {
    const existingByApp = await this.prisma.matchFeeInvoice.findUnique({
      where: { applicationId },
      select: { id: true },
    });
    if (existingByApp) return;

    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        shiftClaims: { select: { shiftId: true } },
        jobPosting: {
          select: {
            id: true,
            title: true,
            hostProfileId: true,
            createdAt: true,
            startDate: true,
            endDate: true,
            startTime: true,
            endTime: true,
            scheduleModel: true,
            shifts: {
              select: {
                id: true,
                date: true,
                shiftType: true,
                startTime: true,
                endTime: true,
              },
            },
            hostProfile: {
              select: {
                userId: true,
                practiceName: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (!app?.locumAcceptedAt) return;

    // Grandfather: no match fee for postings created before today (platform TZ).
    if (
      platformCalendarDateOf(app.jobPosting.createdAt) <
      platformCalendarDateToday()
    ) {
      return;
    }

    // If this posting is seeking a replacement for a prior paid invoice, close
    // that search only when *this* accept is a real replacement (accepted after
    // the cancel) — not a prior co-locum who already had a paid invoice.
    const seekingReplacement = await this.prisma.matchFeeInvoice.findFirst({
      where: {
        jobPostingId: app.jobPostingId,
        OR: [
          { status: 'PENDING_REPLACEMENT' },
          { status: 'PAID', replacementStatus: 'SEARCHING' },
        ],
      },
      select: {
        id: true,
        applicationId: true,
        cancelledAt: true,
      },
      orderBy: { cancelledAt: 'desc' },
    });
    if (
      seekingReplacement &&
      this.isEligibleReplacementForInvoice(
        { id: applicationId, locumAcceptedAt: app.locumAcceptedAt },
        seekingReplacement,
      )
    ) {
      await this.markReplacementFound(seekingReplacement.id);
    }

    const claimedHours = computeApplicationClaimedHours(app.jobPosting, {
      availabilityKind: app.availabilityKind,
      availableDates: app.availableDates,
      requestedShiftIds: app.requestedShiftIds,
      shiftClaims: app.shiftClaims,
    });
    const amountCents = computeMatchFeeAmountCents(claimedHours);
    const matchFeeTier = matchFeeTierFromHours(claimedHours);

    const createdAt = new Date();
    const earliestShiftDate = computeEarliestShiftDate(app.jobPosting, app);
    const dueAt = computeDueAt(createdAt, earliestShiftDate);

    const invoice = await this.prisma.matchFeeInvoice.create({
      data: {
        applicationId,
        hostProfileId: app.jobPosting.hostProfileId,
        jobPostingId: app.jobPostingId,
        amountCents,
        claimedHours,
        matchFeeTier,
        currency: MATCH_FEE_CURRENCY,
        dueAt,
      },
      include: invoiceInclude,
    });

    const host = app.jobPosting.hostProfile;
    if (host?.userId && host.user?.email) {
      await this.notifications.notifyHostMatchFeeInvoiced({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: app.jobPosting.title,
        dueAt,
        invoiceId: invoice.id,
        applicationId,
      });
    }

    await this.recordMatchFeeEvent(invoice.id, 'INVOICED', {
      detail: `${app.jobPosting.title} - ${claimedHours}h (${matchFeeTier} tier, $${(amountCents / 100).toFixed(0)} CAD)`,
    });
  }

  /**
   * Per-locum match fee: when a replacement locum accepts, mark the prior
   * invoice's replacement search as FOUND. A new invoice is created separately
   * via createMatchFeeInvoice for the replacement application.
   */
  async registerReplacementLocumAccepted(applicationId: string): Promise<void> {
    await this.completeReplacementAcceptance(applicationId);
  }

  private async markReplacementFound(invoiceId: string): Promise<void> {
    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        replacementStatus: 'FOUND',
        refundResolution: 'NONE',
      },
    });
    await this.recordMatchFeeEvent(invoiceId, 'REPLACEMENT_FOUND', {
      detail:
        'Replacement locum accepted; original match fee remains paid. A new invoice is created for the replacement locum.',
    });
  }

  /**
   * A replacement must accept *after* the cancel that started the search.
   * Otherwise a prior co-locum (A) on the same posting is wrongly treated as
   * the replacement for a later withdrawn locum (B).
   */
  private isEligibleReplacementForInvoice(
    app: { id: string; locumAcceptedAt: Date | null },
    invoice: { applicationId: string; cancelledAt: Date | null },
  ): boolean {
    if (!app.locumAcceptedAt || !invoice.cancelledAt) return false;
    return app.locumAcceptedAt.getTime() > invoice.cancelledAt.getTime();
  }

  private async completeReplacementAcceptance(
    applicationId: string,
  ): Promise<void> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        locumAcceptedAt: true,
        jobPostingId: true,
      },
    });
    if (!app?.locumAcceptedAt) return;

    const replacementInvoice = await this.prisma.matchFeeInvoice.findFirst({
      where: {
        jobPostingId: app.jobPostingId,
        OR: [
          { status: 'PENDING_REPLACEMENT' },
          {
            status: 'PAID',
            replacementStatus: 'SEARCHING',
          },
        ],
      },
      orderBy: { cancelledAt: 'desc' },
      select: {
        id: true,
        applicationId: true,
        cancelledAt: true,
      },
    });
    if (!replacementInvoice) return;
    if (!this.isEligibleReplacementForInvoice(app, replacementInvoice)) return;

    await this.markReplacementFound(replacementInvoice.id);
    // New per-locum invoice for the replacement application (idempotent).
    await this.createMatchFeeInvoice(applicationId);
  }

  /** Fix invoices left in PENDING_REPLACEMENT after a locum already re-confirmed on the posting. */
  private async syncStuckReplacementInvoices(hostProfileId: string): Promise<void> {
    const stuck = await this.prisma.matchFeeInvoice.findMany({
      where: { hostProfileId, status: 'PENDING_REPLACEMENT' },
      select: {
        id: true,
        jobPostingId: true,
        applicationId: true,
        cancelledAt: true,
        application: { select: { id: true, status: true, locumAcceptedAt: true } },
      },
    });
    for (const inv of stuck) {
      if (
        inv.application.status === 'CONFIRMED' &&
        this.isEligibleReplacementForInvoice(inv.application, inv)
      ) {
        await this.completeReplacementAcceptance(inv.application.id);
        continue;
      }
      // Only a locum who accepted *after* this invoice's cancel counts.
      // Exclude prior co-locums who were already confirmed before the withdraw.
      if (!inv.cancelledAt) continue;
      const replacementApp = await this.prisma.application.findFirst({
        where: {
          jobPostingId: inv.jobPostingId,
          status: 'CONFIRMED',
          locumAcceptedAt: { gt: inv.cancelledAt },
          id: { not: inv.applicationId },
        },
        orderBy: { locumAcceptedAt: 'desc' },
        select: { id: true },
      });
      if (replacementApp) {
        await this.completeReplacementAcceptance(replacementApp.id);
      }
    }
  }

  async listHostInvoices(
    userId: string,
    query: { cursor?: string; limit?: number; status?: string },
  ) {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found');

    await this.syncStuckReplacementInvoices(hostProfile.id);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const where: Prisma.MatchFeeInvoiceWhereInput = {
      hostProfileId: hostProfile.id,
      ...(query.status &&
      [
        'PENDING',
        'PAID',
        'OVERDUE',
        'CANCELLED',
        'REFUNDED',
        'CREDITED',
        'PENDING_REPLACEMENT',
      ].includes(query.status)
        ? { status: query.status as MatchFeeInvoiceStatus }
        : {}),
    };

    const rows = await this.prisma.matchFeeInvoice.findMany({
      where,
      include: invoiceIncludeWithEvents,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit).map(mapInvoice);
    return {
      items,
      nextCursor: hasNextPage ? items[items.length - 1]?.id ?? null : null,
      hasNextPage,
    };
  }

  async getHostMatchFeeDueCount(userId: string) {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found');

    const dueCount = await this.prisma.matchFeeInvoice.count({
      where: {
        hostProfileId: hostProfile.id,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
    });
    const overdueCount = await this.prisma.matchFeeInvoice.count({
      where: {
        hostProfileId: hostProfile.id,
        status: 'OVERDUE',
      },
    });
    return { dueCount, overdueCount };
  }

  async getHostInvoice(userId: string, invoiceId: string) {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found');

    const row = await this.prisma.matchFeeInvoice.findFirst({
      where: { id: invoiceId, hostProfileId: hostProfile.id },
      include: invoiceIncludeWithEvents,
    });
    if (!row) throw new NotFoundException('Invoice not found');
    return mapInvoice(row);
  }

  async payMock(userId: string, invoiceId: string) {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true, user: { select: { email: true } } },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found');

    const invoice = await this.prisma.matchFeeInvoice.findFirst({
      where: { id: invoiceId, hostProfileId: hostProfile.id },
      include: {
        jobPosting: { select: { title: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['PENDING', 'OVERDUE'].includes(invoice.status)) {
      throw new BadRequestException('This invoice cannot be paid in its current state.');
    }

    const mockPaymentRef = `mock_${randomBytes(8).toString('hex')}`;
    const updated = await this.markInvoicePaid({
      invoiceId,
      paymentProvider: 'MOCK',
      mockPaymentRef,
    });
    if (!updated) throw new NotFoundException('Invoice not found');

    return { success: true, invoice: mapInvoice(updated) };
  }

  async handleCancellation(params: {
    applicationId: string;
    cancelledBy: CancellationActor;
    reason?: string;
    context?: 'JOB_REMOVED' | 'MATCH_CANCEL' | 'LOCUM_WITHDRAW';
  }) {
    const app = await this.prisma.application.findUnique({
      where: { id: params.applicationId },
      include: {
        jobPosting: {
          select: {
            id: true,
            hostProfileId: true,
            title: true,
            startDate: true,
            endDate: true,
            shifts: { select: { date: true } },
            hostProfile: {
              select: {
                userId: true,
                practiceName: true,
                user: { select: { email: true } },
              },
            },
          },
        },
        matchFeeInvoice: true,
      },
    });
    if (!app) return;

    const invoice = await this.prisma.matchFeeInvoice.findFirst({
      where: {
        jobPostingId: app.jobPostingId,
        status: { in: ['PENDING', 'OVERDUE', 'PAID', 'PENDING_REPLACEMENT'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invoice) return;

    if (['PAID', 'CANCELLED', 'REFUNDED', 'CREDITED'].includes(invoice.status)) {
      if (invoice.status === 'PAID' && params.cancelledBy !== 'ADMIN') {
        // paid invoices follow refund policy below
      } else if (invoice.status !== 'PAID') {
        return;
      }
    }

    const earliest = computeEarliestShiftDate(app.jobPosting, app);
    const daysUntilStart = daysUntilCalendarDate(earliest);
    const wasPaid =
      invoice.paidAt != null ||
      invoice.status === 'PAID' ||
      invoice.status === 'PENDING_REPLACEMENT';
    const policy = evaluateCancellationPolicy({
      cancelledBy: params.cancelledBy,
      wasPaid,
      daysUntilStart,
      reason: params.reason,
    });

    let nextStatus = invoice.status;
    if (policy.invoiceStatus !== 'UNCHANGED') {
      nextStatus = policy.invoiceStatus;
    } else if (wasPaid) {
      nextStatus = 'PAID';
    }

    const host = app.jobPosting.hostProfile;
    const jobRemoved = params.context === 'JOB_REMOVED';
    const actor = cancellationActorToEventActor(
      params.cancelledBy as MatchFeeCancelledBy,
    );

    if (nextStatus === 'REFUNDED' && wasPaid) {
      await this.processRefund({
        invoiceId: invoice.id,
        reason: policy.reason,
        cancelledBy: params.cancelledBy as MatchFeeCancelledBy,
      });
      if (jobRemoved) {
        await this.recordMatchFeeEvent(invoice.id, 'POSTING_REMOVED', {
          detail: params.reason ?? 'Host removed the job posting.',
          actor: 'HOST',
        });
      }
      await this.adminNotifications.notifyMatchFeeOutcome({
        invoiceId: invoice.id,
        hostPracticeName: host?.practiceName ?? 'Host',
        jobTitle: app.jobPosting.title,
        outcome: 'REFUND_ISSUED',
        detail: policy.reason,
      });
      return;
    }

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoice.id },
      data: {
        status: nextStatus,
        cancelledAt: new Date(),
        cancelledBy: params.cancelledBy as MatchFeeCancelledBy,
        cancellationReason: policy.reason,
        refundResolution: policy.refundResolution,
        replacementStatus: policy.replacementStatus,
      },
    });

    if (jobRemoved) {
      await this.recordMatchFeeEvent(invoice.id, 'POSTING_REMOVED', {
        detail: params.reason ?? 'Job posting removed.',
        actor: 'HOST',
      });
    }

    if (nextStatus === 'PENDING_REPLACEMENT') {
      await this.recordMatchFeeEvent(invoice.id, 'REPLACEMENT_SEARCHING', {
        detail: policy.reason,
        actor,
      });
      await this.adminNotifications.notifyMatchFeeOutcome({
        invoiceId: invoice.id,
        hostPracticeName: host?.practiceName ?? 'Host',
        jobTitle: app.jobPosting.title,
        outcome: 'REPLACEMENT_SEARCHING',
        detail: policy.reason,
      });
    } else if (nextStatus === 'CANCELLED') {
      await this.recordMatchFeeEvent(invoice.id, 'CANCELLED', {
        detail: policy.reason,
        actor,
      });
      await this.adminNotifications.notifyMatchFeeOutcome({
        invoiceId: invoice.id,
        hostPracticeName: host?.practiceName ?? 'Host',
        jobTitle: app.jobPosting.title,
        outcome: 'INVOICE_VOIDED',
        detail: policy.reason,
      });
    } else if (nextStatus === 'PAID' && policy.nonRefundable && wasPaid) {
      await this.recordMatchFeeEvent(invoice.id, 'FEE_NON_REFUNDABLE', {
        detail: policy.reason,
        actor,
      });
      await this.adminNotifications.notifyMatchFeeOutcome({
        invoiceId: invoice.id,
        hostPracticeName: host?.practiceName ?? 'Host',
        jobTitle: app.jobPosting.title,
        outcome: 'FEE_NON_REFUNDABLE',
        detail: policy.reason,
      });
    }

    if (host?.userId && host.user?.email) {
      await this.notifications.notifyHostMatchFeeCancelled({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: app.jobPosting.title,
        reason: policy.reason,
        invoiceId: invoice.id,
      });
    }

    if (nextStatus === 'REFUNDED' || nextStatus === 'CANCELLED') {
      await this.syncHostReviewFlag(app.jobPosting.hostProfileId);
    }
  }

  async cancelInvoicesForJob(jobPostingId: string, cancelledBy: CancellationActor) {
    const invoices = await this.prisma.matchFeeInvoice.findMany({
      where: {
        jobPostingId,
        status: { in: ['PENDING', 'OVERDUE', 'PAID', 'PENDING_REPLACEMENT'] },
      },
      select: { applicationId: true },
    });
    for (const inv of invoices) {
      await this.handleCancellation({
        applicationId: inv.applicationId,
        cancelledBy,
        reason: 'Job posting removed.',
        context: 'JOB_REMOVED',
      });
    }
  }

  async syncHostReviewFlag(hostProfileId: string) {
    const openIssues = await this.prisma.matchFeeInvoice.count({
      where: {
        hostProfileId,
        OR: [
          { status: 'OVERDUE' },
          { escalatedAt: { not: null }, status: { in: ['PENDING', 'OVERDUE'] } },
        ],
      },
    });
    await this.prisma.hostProfile.update({
      where: { id: hostProfileId },
      data: { matchFeeReviewRequired: openIssues > 0 },
    });
  }

  async markOverdueInvoices(now = new Date()) {
    const due = await this.prisma.matchFeeInvoice.findMany({
      where: {
        status: 'PENDING',
        dueAt: { lt: now },
      },
      include: {
        jobPosting: { select: { title: true } },
        hostProfile: {
          select: {
            id: true,
            userId: true,
            user: { select: { email: true } },
          },
        },
      },
    });

    for (const invoice of due) {
      await this.prisma.matchFeeInvoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE' },
      });
      await this.recordMatchFeeEvent(invoice.id, 'OVERDUE', {
        detail: `Due date was ${invoice.dueAt.toLocaleDateString('en-CA', { timeZone: 'UTC' })}.`,
      });
      const host = invoice.hostProfile;
      if (host?.userId && host.user?.email) {
        await this.notifications.notifyHostMatchFeeOverdue({
          recipientId: host.userId,
          recipientEmail: host.user.email,
          jobTitle: invoice.jobPosting.title,
          invoiceId: invoice.id,
        });
      }
      await this.syncHostReviewFlag(invoice.hostProfileId);
    }
  }

  async escalateLongOverdueInvoices(now = new Date()) {
    const overdue = await this.prisma.matchFeeInvoice.findMany({
      where: {
        status: 'OVERDUE',
        escalatedAt: null,
      },
      include: {
        jobPosting: { select: { title: true } },
        hostProfile: {
          select: {
            id: true,
            practiceName: true,
            userId: true,
          },
        },
      },
    });

    for (const invoice of overdue) {
      if (!isEscalationDue(invoice.dueAt, invoice.escalatedAt, now)) continue;

      await this.prisma.matchFeeInvoice.update({
        where: { id: invoice.id },
        data: { escalatedAt: now },
      });
      await this.recordMatchFeeEvent(invoice.id, 'ESCALATED', {
        detail: 'Unpaid match fee overdue beyond policy threshold.',
      });
      await this.prisma.hostProfile.update({
        where: { id: invoice.hostProfileId },
        data: { matchFeeReviewRequired: true },
      });
      await this.adminNotifications.notifyMatchFeeOverdueEscalation({
        invoiceId: invoice.id,
        hostPracticeName: invoice.hostProfile.practiceName,
        jobTitle: invoice.jobPosting.title,
        amountCents: invoice.amountCents,
      });
    }
  }

  async listAdminInvoices(query: {
    cursor?: string;
    limit?: number;
    status?: string;
    escalatedOnly?: boolean;
  }) {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const where: Prisma.MatchFeeInvoiceWhereInput = {
      ...(query.status &&
      [
        'PENDING',
        'PAID',
        'OVERDUE',
        'CANCELLED',
        'REFUNDED',
        'CREDITED',
        'PENDING_REPLACEMENT',
      ].includes(query.status)
        ? { status: query.status as MatchFeeInvoiceStatus }
        : {}),
      ...(query.escalatedOnly ? { escalatedAt: { not: null } } : {}),
    };

    const rows = await this.prisma.matchFeeInvoice.findMany({
      where,
      include: {
        ...invoiceIncludeWithEvents,
        hostProfile: {
          select: {
            id: true,
            practiceName: true,
            matchFeeReviewRequired: true,
            user: { select: { id: true, email: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => mapAdminInvoice(row));
    return {
      items,
      statusGuide: MATCH_FEE_STATUS_ADMIN_GUIDE,
      nextCursor: hasNextPage ? items[items.length - 1]?.id ?? null : null,
      hasNextPage,
    };
  }

  async adminMatchFeeSummary(params?: { days?: number }) {
    const statuses: MatchFeeInvoiceStatus[] = [
      'PENDING',
      'OVERDUE',
      'PAID',
      'PENDING_REPLACEMENT',
      'REFUNDED',
      'CREDITED',
      'CANCELLED',
    ];
    const counts = await Promise.all(
      statuses.map((status) =>
        this.prisma.matchFeeInvoice.count({ where: { status } }),
      ),
    );
    const byStatus = Object.fromEntries(
      statuses.map((status, i) => [status, counts[i]]),
    ) as Record<MatchFeeInvoiceStatus, number>;
    const escalated = await this.prisma.matchFeeInvoice.count({
      where: { escalatedAt: { not: null } },
    });
    const reviewHosts = await this.prisma.hostProfile.count({
      where: { matchFeeReviewRequired: true },
    });

    const days =
      params?.days != null && Number.isFinite(params.days) && params.days > 0
        ? Math.floor(params.days)
        : null;
    const paidSince =
      days != null
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        : null;
    const paidWhere = {
      status: 'PAID' as const,
      paidAt: paidSince
        ? { gte: paidSince }
        : { not: null as Date | null },
    };
    const [receivedCount, receivedSum] = await Promise.all([
      this.prisma.matchFeeInvoice.count({ where: paidWhere }),
      this.prisma.matchFeeInvoice.aggregate({
        where: paidWhere,
        _sum: { amountCents: true },
      }),
    ]);

    return {
      byStatus,
      escalated,
      reviewHosts,
      stripeEnabled: this.stripeService.isEnabled(),
      received: {
        days,
        count: receivedCount,
        amountCents: receivedSum._sum.amountCents ?? 0,
      },
    };
  }

  async sendAdminPaymentReminder(
    invoiceId: string,
    options: { sendEmail: boolean; sendNotification: boolean },
  ) {
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        jobPosting: { select: { title: true } },
        hostProfile: {
          select: {
            userId: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['PENDING', 'OVERDUE'].includes(invoice.status)) {
      throw new BadRequestException(
        'Reminders can only be sent for pending or overdue invoices.',
      );
    }
    if (!options.sendEmail && !options.sendNotification) {
      throw new BadRequestException('Choose email, notification, or both.');
    }

    const host = invoice.hostProfile;
    if (!host?.userId || !host.user?.email) {
      throw new BadRequestException('Host contact not found.');
    }

    if (options.sendNotification || options.sendEmail) {
      await this.notifications.notifyHostMatchFeePaymentReminder({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: invoice.jobPosting.title,
        dueAt: invoice.dueAt,
        invoiceId: invoice.id,
        status: invoice.status,
        sendEmail: options.sendEmail,
        sendNotification: options.sendNotification,
      });
    }

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: { lastReminderAt: new Date() },
    });

    await this.recordMatchFeeEvent(invoiceId, 'PAYMENT_REMINDER', {
      detail: [
        options.sendEmail ? 'email' : null,
        options.sendNotification ? 'in-app' : null,
      ]
        .filter(Boolean)
        .join(' + '),
      actor: 'ADMIN',
    });

    return { success: true };
  }

  async createStripeCheckoutForHost(userId: string, invoiceId: string) {
    if (!this.stripeService.isEnabled()) {
      throw new BadRequestException('Stripe payments are not configured.');
    }

    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found');

    const invoice = await this.prisma.matchFeeInvoice.findFirst({
      where: { id: invoiceId, hostProfileId: hostProfile.id },
      include: { jobPosting: { select: { title: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['PENDING', 'OVERDUE'].includes(invoice.status)) {
      throw new BadRequestException('This invoice cannot be paid in its current state.');
    }

    const { url, sessionId } =
      await this.stripeService.createMatchFeeCheckoutSession({
        invoiceId: invoice.id,
        hostProfileId: invoice.hostProfileId,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        jobTitle: invoice.jobPosting.title,
      });

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: { stripeCheckoutSessionId: sessionId },
    });

    return { success: true, url };
  }

  async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.matchFeeInvoiceId;
      if (!invoiceId) return;

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;

      await this.markInvoicePaid({
        invoiceId,
        paymentProvider: 'STRIPE',
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId ?? null,
        externalRef: paymentIntentId ?? session.id,
      });
      return;
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const invoiceId = intent.metadata?.matchFeeInvoiceId;
      if (!invoiceId) return;
      this.logger.warn(
        `Stripe payment failed for match fee invoice ${invoiceId}`,
      );
    }
  }

  private async markInvoicePaid(params: {
    invoiceId: string;
    paymentProvider: 'MOCK' | 'STRIPE';
    mockPaymentRef?: string;
    stripeCheckoutSessionId?: string;
    stripePaymentIntentId?: string | null;
    externalRef?: string;
  }) {
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: params.invoiceId },
      include: {
        jobPosting: { select: { title: true, hostProfileId: true } },
        hostProfile: {
          select: { id: true, userId: true, user: { select: { email: true } } },
        },
      },
    });
    if (!invoice) return;
    if (invoice.status === 'PAID') return;

    const paidAt = new Date();
    const updated = await this.prisma.matchFeeInvoice.update({
      where: { id: params.invoiceId },
      data: {
        status: 'PAID',
        paidAt,
        paymentProvider: params.paymentProvider,
        mockPaymentRef:
          params.paymentProvider === 'MOCK' ? params.mockPaymentRef : null,
        stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? undefined,
        stripePaymentIntentId: params.stripePaymentIntentId ?? undefined,
      },
      include: invoiceIncludeWithEvents,
    });

    await this.syncHostReviewFlag(invoice.hostProfileId);

    await this.recordMatchFeeEvent(params.invoiceId, 'PAID', {
      detail:
        params.paymentProvider === 'STRIPE'
          ? 'Paid via Stripe.'
          : `Mock payment ${params.mockPaymentRef ?? ''}`.trim(),
      occurredAt: paidAt,
    });

    const host = invoice.hostProfile;
    if (host?.userId && host.user?.email) {
      await this.notifications.notifyHostMatchFeePaid({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: invoice.jobPosting.title,
        invoiceId: params.invoiceId,
      });
    }

    return updated;
  }

  async resolveRefund(invoiceId: string, adminNotes?: string) {
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        jobPosting: {
          select: {
            startDate: true,
            endDate: true,
            shifts: { select: { date: true } },
          },
        },
        application: {
          select: { availabilityKind: true, availableDates: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PENDING_REPLACEMENT') {
      throw new BadRequestException(
        'Locum cancelled within 14 days of start. Per policy, use "No replacement" after searching - that issues the host refund if none is found.',
      );
    }
    if (invoice.status !== 'PAID') {
      throw new BadRequestException(
        'Only a paid invoice after an eligible cancellation can be refunded from this action.',
      );
    }

    const events = await this.prisma.matchFeeInvoiceEvent.findMany({
      where: { invoiceId },
      select: { eventType: true },
    });
    const postingRemoved = events.some((e) => e.eventType === 'POSTING_REMOVED');
    const reasonText = (invoice.cancellationReason ?? '').toLowerCase();
    const hostDeletedPost =
      postingRemoved ||
      (invoice.cancelledBy === 'HOST' &&
        (reasonText.includes('job posting removed') ||
          reasonText.includes('posting removed') ||
          reasonText.includes('removed the job')));
    const locumWithdrew = invoice.cancelledBy === 'LOCUM';
    if (!locumWithdrew && !hostDeletedPost) {
      throw new BadRequestException(
        'Refund is only available after a locum withdraws or the host deletes the posting (and more than 14 days before start).',
      );
    }

    // Early cancel only: more than 14 days before start → refund allowed.
    const earliest = computeEarliestShiftDate(
      invoice.jobPosting,
      invoice.application,
    );
    const daysUntilStart = daysUntilCalendarDate(earliest);
    if (
      daysUntilStart == null ||
      daysUntilStart <= MATCH_FEE_CANCELLATION_WINDOW_DAYS
    ) {
      if (locumWithdrew) {
        throw new BadRequestException(
          'Locum cancelled within 14 days of start. Use the replacement flow; refund only if no replacement is found.',
        );
      }
      throw new BadRequestException(
        'Host cancelled within 14 days of start - the match fee is non-refundable if already paid.',
      );
    }

    await this.processRefund({
      invoiceId,
      adminNotes,
      cancelledBy: 'ADMIN',
      reason:
        adminNotes ??
        (locumWithdrew
          ? 'Admin refund after locum withdraw - more than 14 days before start.'
          : 'Admin refund after host deleted posting - more than 14 days before start.'),
    });
    return { success: true };
  }

  async setReplacementStatus(
    invoiceId: string,
    replacementStatus: MatchFeeReplacementStatus,
    adminNotes?: string,
  ) {
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        jobPosting: { select: { title: true, hostProfileId: true } },
        hostProfile: {
          select: { userId: true, user: { select: { email: true } } },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'PENDING_REPLACEMENT') {
      throw new BadRequestException('Invoice is not awaiting replacement resolution.');
    }

    if (replacementStatus === 'FOUND') {
      await this.prisma.matchFeeInvoice.update({
        where: { id: invoiceId },
        data: {
          replacementStatus: 'FOUND',
          status: 'PAID',
          refundResolution: 'NONE',
          adminNotes: adminNotes ?? invoice.adminNotes,
        },
      });
      await this.recordMatchFeeEvent(invoiceId, 'REPLACEMENT_FOUND', {
        detail: adminNotes,
        actor: 'ADMIN',
      });
    } else if (replacementStatus === 'NOT_FOUND') {
      await this.prisma.matchFeeInvoice.update({
        where: { id: invoiceId },
        data: {
          replacementStatus: 'NOT_FOUND',
          adminNotes: adminNotes ?? invoice.adminNotes,
        },
      });
      await this.recordMatchFeeEvent(invoiceId, 'REPLACEMENT_NOT_FOUND', {
        detail: adminNotes,
        actor: 'ADMIN',
      });
      await this.processRefund({
        invoiceId,
        reason:
          adminNotes ??
          'No replacement locum found; refund to original payment method.',
        cancelledBy: 'ADMIN',
        adminNotes,
      });
    }

    await this.syncHostReviewFlag(invoice.jobPosting.hostProfileId);
    return { success: true };
  }

  async writeOffInvoice(invoiceId: string, adminNotes?: string) {
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, hostProfileId: true, status: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['PENDING', 'OVERDUE'].includes(invoice.status)) {
      throw new BadRequestException('Only unpaid invoices can be written off.');
    }

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: 'ADMIN',
        cancellationReason: 'Admin write-off for long-overdue invoice.',
        adminNotes,
      },
    });
    await this.recordMatchFeeEvent(invoiceId, 'CANCELLED', {
      detail: 'Admin write-off for long-overdue invoice.',
      actor: 'ADMIN',
    });
    await this.syncHostReviewFlag(invoice.hostProfileId);
    return { success: true };
  }

  async clearHostReviewFlag(hostProfileId: string, adminNotes?: string) {
    await this.prisma.hostProfile.update({
      where: { id: hostProfileId },
      data: { matchFeeReviewRequired: false },
    });
    if (adminNotes) {
      await this.prisma.matchFeeInvoice.updateMany({
        where: { hostProfileId, escalatedAt: { not: null } },
        data: { adminNotes },
      });
    }
    return { success: true };
  }

  async adminOverride(
    invoiceId: string,
    status: MatchFeeInvoiceStatus,
    adminNotes: string,
  ) {
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, hostProfileId: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: {
        status,
        adminNotes,
        cancelledAt: ['CANCELLED', 'REFUNDED', 'CREDITED'].includes(status)
          ? new Date()
          : undefined,
        cancelledBy: ['CANCELLED', 'REFUNDED', 'CREDITED'].includes(status)
          ? 'ADMIN'
          : undefined,
      },
    });
    await this.syncHostReviewFlag(invoice.hostProfileId);
    return { success: true };
  }

  async getInvoiceSummaryForApplications(applicationIds: string[]) {
    if (applicationIds.length === 0) return new Map<string, MatchFeeInvoiceDto>();
    const rows = await this.prisma.matchFeeInvoice.findMany({
      where: { applicationId: { in: applicationIds } },
      include: invoiceIncludeWithEvents,
    });
    return new Map(rows.map((row) => [row.applicationId, mapInvoice(row)]));
  }

  async buildHostReceiptPdf(userId: string, invoiceId: string): Promise<Buffer> {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        practiceName: true,
        user: { select: { email: true } },
      },
    });
    if (!hostProfile?.user?.email) {
      throw new NotFoundException('Host profile not found');
    }

    const row = await this.prisma.matchFeeInvoice.findFirst({
      where: { id: invoiceId, hostProfileId: hostProfile.id },
      include: invoiceIncludeWithEvents,
    });
    if (!row) throw new NotFoundException('Invoice not found');

    const mapped = mapInvoice(row);
    const receiptNumber = row.id.slice(-8).toUpperCase();
    const paymentReference =
      row.paymentProvider === 'STRIPE'
        ? (row.stripePaymentIntentId ?? row.stripeCheckoutSessionId)
        : row.mockPaymentRef;

    return buildMatchFeeReceiptPdf({
      invoiceId: row.id,
      invoiceNumber: receiptNumber,
      issuedAt: row.createdAt,
      paidAt: row.paidAt,
      dueAt: row.dueAt,
      amountCents: row.amountCents,
      currency: row.currency,
      status: row.status,
      jobTitle: mapped.jobTitle,
      postingScheduleLabel: mapped.postingScheduleLabel,
      postingLocation: mapped.postingLocation,
      locumName: mapped.locumName,
      practiceName: hostProfile.practiceName,
      hostEmail: hostProfile.user.email,
      paymentProvider:
        row.paymentProvider === 'STRIPE' ? 'Stripe (card)' : 'Test payment',
      paymentReference,
    });
  }
}
