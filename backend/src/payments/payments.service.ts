import { Injectable, Logger } from '@nestjs/common';
import {
  MatchFeeCancelledBy,
  MatchFeeInvoiceEventActor,
  MatchFeeInvoiceEventType,
  MatchFeeInvoiceKind,
  MatchFeeInvoiceStatus,
  MatchFeeRefundKind,
  MatchFeeRefundResolution,
  MatchFeeReplacementStatus,
  Prisma,
} from '../prisma/prisma-client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import {
  MATCH_FEE_CURRENCY,
  MATCH_FEE_HST_RATE_BPS,
  computeMatchFeeTaxCents,
  formatTaxRate,
  matchFeeTotalCents,
  MATCH_FEE_POLICY,
  MATCH_FEE_CANCELLATION_WINDOW_DAYS,
  MATCH_FEE_HALF_CENTS,
  MATCH_FEE_FULL_CENTS,
  MATCH_FEE_OVERDUE_REMINDER_INTERVAL_DAYS,
  computeMatchFeeAmountCents,
  isPostingGrandfatheredFromMatchFee,
  isMatchFeeTestingSkipLocumReplacement,
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
  paymentProviderLabel,
  type MatchFeeInvoiceEventDto,
} from './match-fee-invoice.events.js';
import { buildMatchFeeReceiptPdf } from './match-fee-receipt.pdf.js';
import { StripeService } from './stripe.service.js';
import Stripe from 'stripe';
import {
  computeApplicationClaimedHours,
  getPostingRequiredDates,
  platformCalendarDateOf,
  platformCalendarDateToday,
} from '../host/job-schedule.util.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

const PAYABLE_INVOICE_STATUSES: MatchFeeInvoiceStatus[] = ['PENDING', 'OVERDUE'];
/** An open Checkout session is handed out again only if it has at least this long left. */
const CHECKOUT_REUSE_MIN_REMAINING_MS = 5 * 60_000;
/** Another pay request while Stripe Checkout is still being created for this invoice. */
const CHECKOUT_CREATE_IN_FLIGHT_MS = 2 * 60_000;
/** Give the webhook a head start before reconciliation asks Stripe directly. */
const RECONCILE_MIN_AGE_MS = 2 * 60_000;
const ORPHAN_ATTEMPT_AGE_MS = 15 * 60_000;
/** A webhook delivery stuck in PROCESSING this long (crash mid-handler) may be retried. */
const WEBHOOK_PROCESSING_STALE_MS = 5 * 60_000;
/** Stripe keeps idempotency keys for 24h; after that a refund is only re-created if Stripe has no record of it. */
const REFUND_RETRY_WINDOW_MS = 23 * 60 * 60_000;

type RefundAdmin = { id: string; email: string };

function requireRefundReason(reason: string | null | undefined): string {
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length < 3) {
    throw new BadRequestException('Add a note explaining why this refund is being issued.');
  }
  return trimmed.slice(0, 1000);
}

function isRetryableStripeError(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeAPIError ||
    err instanceof Stripe.errors.StripeRateLimitError
  );
}

type CheckoutOutcome =
  | 'paid'
  | 'already-paid'
  | 'processing'
  | 'open'
  | 'expired'
  | 'rejected'
  | 'duplicate'
  | 'unknown';

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
  replacementApplication: {
    select: {
      id: true,
      locumProfile: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  jobPosting: {
    select: {
      id: true,
      title: true,
      location: true,
      status: true,
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
  supportTicket: { select: { id: true, status: true } },
} satisfies Prisma.MatchFeeInvoiceInclude;

const invoiceIncludeWithEvents = {
  ...invoiceInclude,
  events: { orderBy: { occurredAt: 'asc' as const } },
  refunds: { select: { status: true, kind: true } },
} satisfies Prisma.MatchFeeInvoiceInclude;

const NON_DUPLICATE_REFUND_IN_FLIGHT: Prisma.MatchFeeRefundWhereInput = {
  kind: { not: 'DUPLICATE_PAYMENT' },
  status: { in: ['REQUESTED', 'PENDING'] },
};

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
  /** PRIMARY at accept; TIER_TOP_UP = post-placement half→full delta. */
  kind: MatchFeeInvoiceKind;
  jobPostingId: string;
  /** Match fee before HST. */
  amountCents: number;
  taxRateBps: number;
  taxCents: number;
  /** What the host pays: amountCents + taxCents. */
  totalCents: number;
  claimedHours: number | null;
  matchFeeTier: string | null;
  currency: string;
  status: MatchFeeInvoiceStatus;
  /** Cancellation qualified for a refund; waiting for an admin to approve it. */
  refundPendingReview: boolean;
  /** Stripe refund submitted and not yet succeeded (card refund still processing). */
  stripeRefundProcessing: boolean;
  /** Host late-cancelled within 14 days; paid fee kept per policy. */
  feeRetained: boolean;
  dueAt: string;
  paidAt: string | null;
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
  /** True when the related posting has ended / is COMPLETED — host may raise a ticket. */
  postingCompleted: boolean;
  /** Existing host ticket for this invoice (at most one). */
  supportTicket: { id: string; status: string } | null;
  /** Original confirmed locum this invoice was created for. */
  locumName: string;
  /** Locum who accepted as replacement (when replacementStatus is FOUND). */
  replacedByLocumName: string | null;
  replacementApplicationId: string | null;
  daysUntilStart: number | null;
  refundedCents: number;
  events: MatchFeeInvoiceEventDto[];
};

function isRefundPendingReview(row: {
  status: MatchFeeInvoiceStatus;
  refundResolution: MatchFeeRefundResolution;
}): boolean {
  return row.status === 'PAID' && row.refundResolution === 'PENDING';
}

function isStripeRefundProcessing(row: {
  refunds?: { status: string; kind: string }[];
}): boolean {
  return (
    row.refunds?.some(
      (r) =>
        r.kind !== 'DUPLICATE_PAYMENT' &&
        (r.status === 'REQUESTED' || r.status === 'PENDING'),
    ) ?? false
  );
}

function isFeeRetained(row: {
  status: MatchFeeInvoiceStatus;
  refundResolution: MatchFeeRefundResolution;
  events?: { eventType: MatchFeeInvoiceEventType }[];
}): boolean {
  if (row.status !== 'PAID' || row.refundResolution !== 'NONE') return false;
  return (row.events ?? []).some((e) => e.eventType === 'FEE_NON_REFUNDABLE');
}

function formatCad(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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
  const postingCompleted =
    row.jobPosting.status === 'COMPLETED' ||
    (row.jobPosting.endDate != null &&
      platformCalendarDateOf(row.jobPosting.endDate) <
        platformCalendarDateToday());
  return {
    id: row.id,
    applicationId: row.applicationId,
    kind: row.kind,
    jobPostingId: row.jobPostingId,
    amountCents: row.amountCents,
    taxRateBps: row.taxRateBps,
    taxCents: row.taxCents,
    totalCents: matchFeeTotalCents(row),
    claimedHours:
      row.claimedHours != null ? Number(row.claimedHours) : null,
    matchFeeTier: row.matchFeeTier ?? null,
    currency: row.currency,
    status: row.status,
    refundPendingReview: isRefundPendingReview(row),
    stripeRefundProcessing: isStripeRefundProcessing(row),
    feeRetained: isFeeRetained(row),
    dueAt: row.dueAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
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
    postingCompleted,
    supportTicket: row.supportTicket
      ? { id: row.supportTicket.id, status: row.supportTicket.status }
      : null,
    locumName: formatLocumName(
      row.application.locumProfile.firstName,
      row.application.locumProfile.lastName,
    ),
    replacedByLocumName: row.replacementApplication
      ? formatLocumName(
          row.replacementApplication.locumProfile.firstName,
          row.replacementApplication.locumProfile.lastName,
        )
      : null,
    replacementApplicationId: row.replacementApplicationId ?? null,
    daysUntilStart: daysUntilCalendarDate(earliest),
    refundedCents: row.refundedCents ?? 0,
    events: mergeMatchFeeEvents(row.events ?? [], row),
  };
}

const adminInvoiceInclude = {
  ...invoiceIncludeWithEvents,
  hostProfile: {
    select: {
      id: true,
      practiceName: true,
      matchFeeReviewRequired: true,
      user: { select: { id: true, email: true } },
    },
  },
  paymentAttempts: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
    select: {
      id: true,
      status: true,
      amountCents: true,
      currency: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      expiresAt: true,
      completedAt: true,
      lastEventType: true,
      failureReason: true,
      createdAt: true,
    },
  },
  refunds: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
    select: {
      id: true,
      kind: true,
      status: true,
      amountCents: true,
      taxCents: true,
      currency: true,
      paymentAttemptId: true,
      stripeRefundId: true,
      reason: true,
      requestedByAdminEmail: true,
      failureReason: true,
      completedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.MatchFeeInvoiceInclude;

function refundInProgressGuide(cancellationReason: string | null) {
  const fallback = MATCH_FEE_STATUS_ADMIN_GUIDE.find(
    (g) => g.status === 'REFUND_IN_PROGRESS',
  )!;
  const reason = cancellationReason?.trim();
  return {
    ...fallback,
    summary: reason
      ? `${reason} Approve the refund to return the fee and HST.`
      : fallback.summary,
  };
}

function mapAdminInvoice(
  row: Prisma.MatchFeeInvoiceGetPayload<{ include: typeof adminInvoiceInclude }>,
) {
  const base = mapInvoice(row);
  const statusGuide = isRefundPendingReview(row)
    ? refundInProgressGuide(row.cancellationReason)
    : MATCH_FEE_STATUS_ADMIN_GUIDE.find((g) => g.status === row.status);
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
    paymentAttempts: row.paymentAttempts.map((a) => ({
      ...a,
      expiresAt: a.expiresAt?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    refunds: row.refunds.map((r) => ({
      ...r,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    statusGuide: statusGuide ?? null,
    timeline,
    events: base.events,
    /** TEMP: when true, late locum cancel skips replacement (admin may refund). */
    testingSkipLocumReplacement: isMatchFeeTestingSkipLocumReplacement(),
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
          ? 'LocumLink is free for locums. The host pays a match fee ($5 or $10) after you accept a confirmed placement, based on total hours claimed.'
          : 'Free to post. Pay $5 or $10 per matched locum when they accept your confirmed match. Fees stay as invoiced, during the placement. After the last shift on an invoice, you can raise a ticket if you have concerns and LocumLink will follow up.',
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

  /**
   * Refunds part or all of a paid invoice to the original card. Only admin actions call this.
   * The amount is reserved on the invoice under a row lock before Stripe is called, so a double
   * click or two admins at once cannot refund more than was paid.
   */
  private async processRefund(params: {
    invoiceId: string;
    kind: Exclude<MatchFeeRefundKind, 'DUPLICATE_PAYMENT'>;
    admin: RefundAdmin;
    reason: string;
    cancelledBy?: MatchFeeCancelledBy;
    adminNotes?: string | null;
    notifyHost?: boolean;
    /** Match fee portion to refund, before HST (HST is added at the invoice rate). Defaults to everything left. */
    feeCents?: number;
  }): Promise<void> {
    const reservation = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM match_fee_invoices WHERE id = ${params.invoiceId} FOR UPDATE`;
      const invoice = await tx.matchFeeInvoice.findUnique({
        where: { id: params.invoiceId },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');

      const inFlight = await tx.matchFeeRefund.count({
        where: { invoiceId: invoice.id, ...NON_DUPLICATE_REFUND_IN_FLIGHT },
      });
      if (inFlight > 0) {
        throw new ConflictException(
          'A refund for this invoice is already being processed at Stripe.',
        );
      }

      const total = matchFeeTotalCents(invoice);
      const remaining = Math.max(0, total - invoice.refundedCents);
      if (remaining <= 0) {
        const incomplete = await tx.matchFeeRefund.count({
          where: {
            invoiceId: invoice.id,
            kind: { not: 'DUPLICATE_PAYMENT' },
            status: { not: 'SUCCEEDED' },
          },
        });
        if (incomplete > 0) {
          throw new ConflictException(
            'A refund for this invoice is still settling at Stripe.',
          );
        }
        if (invoice.status !== 'REFUNDED' && invoice.refundedCents >= total) {
          await tx.matchFeeInvoice.update({
            where: { id: invoice.id },
            data: { status: 'REFUNDED', refundResolution: 'REFUND' },
          });
        }
        return null;
      }

      const wasCollected =
        invoice.paidAt != null ||
        invoice.status === 'PAID' ||
        invoice.status === 'PENDING_REPLACEMENT';
      if (!wasCollected) {
        throw new BadRequestException('This invoice was not paid, so there is nothing to refund.');
      }

      const taxCents =
        params.feeCents != null
          ? computeMatchFeeTaxCents(params.feeCents, invoice.taxRateBps)
          : total > 0
            ? Math.round((remaining * invoice.taxCents) / total)
            : 0;
      const amountCents =
        params.feeCents != null ? params.feeCents + taxCents : remaining;
      if (amountCents <= 0 || amountCents > remaining) {
        throw new BadRequestException(
          `Only ${formatCad(remaining)} remains refundable on this invoice.`,
        );
      }

      const paymentIntentId =
        invoice.paymentProvider === 'STRIPE' ? invoice.stripePaymentIntentId : null;
      const refund = await tx.matchFeeRefund.create({
        data: {
          invoiceId: invoice.id,
          kind: params.kind,
          amountCents,
          taxCents,
          currency: invoice.currency,
          stripePaymentIntentId: paymentIntentId,
          reason: params.reason,
          requestedByAdminId: params.admin.id,
          requestedByAdminEmail: params.admin.email,
          ...(paymentIntentId
            ? {}
            : {
                status: 'SUCCEEDED' as const,
                completedAt: new Date(),
                failureReason:
                  'No Stripe payment on this invoice; recorded as refunded without calling Stripe.',
              }),
        },
      });
      await tx.matchFeeInvoice.update({
        where: { id: invoice.id },
        data: { refundedCents: { increment: amountCents } },
      });
      return { refund, invoice, total, paymentIntentId };
    });

    if (!reservation) return;
    const { refund, invoice, paymentIntentId } = reservation;

    let stripeRefund: Stripe.Refund | null = null;
    if (paymentIntentId) {
      stripeRefund = await this.createStripeRefund(refund.id, {
        paymentIntentId,
        amountCents: refund.amountCents,
        invoiceId: invoice.id,
      });
    }

    // Persist admin context even while Stripe is still processing.
    await this.prisma.matchFeeInvoice.update({
      where: { id: invoice.id },
      data: {
        refundResolution: 'REFUND',
        stripeRefundId: stripeRefund?.id ?? undefined,
        cancellationReason: params.reason,
        adminNotes: params.adminNotes ?? undefined,
        cancelledBy: params.cancelledBy ?? 'ADMIN',
      },
    });

    if (!paymentIntentId) {
      // No Stripe payment on file — reservation already marked SUCCEEDED.
      await this.finalizeSuccessfulRefund(refund.id, {
        notifyHost: params.notifyHost !== false,
        cancelledBy: params.cancelledBy ?? 'ADMIN',
      });
      return;
    }

    if (stripeRefund?.status === 'succeeded') {
      // createStripeRefund → applyStripeRefund already finalized the invoice side.
      return;
    }

    // Stripe accepted the refund but it is still pending — do not mark REFUNDED or notify yet.
    const taxNote =
      refund.taxCents > 0 ? ` (includes ${formatCad(refund.taxCents)} HST)` : '';
    await this.recordMatchFeeEvent(invoice.id, 'ADMIN_NOTE', {
      detail: `Refund of ${formatCad(refund.amountCents)}${taxNote} submitted to Stripe (${stripeRefund?.id ?? 'pending'}); waiting for confirmation. Approved by ${params.admin.email}.`,
      actor: cancellationActorToEventActor(params.cancelledBy ?? 'ADMIN'),
    });
    await this.syncHostReviewFlag(invoice.hostProfileId);
  }

  /**
   * Marks the invoice (or duplicate attempt) refunded once Stripe confirms success.
   * Idempotent: safe to call from the sync path and again from webhooks/reconcile.
   */
  private async finalizeSuccessfulRefund(
    refundId: string,
    opts?: { notifyHost?: boolean; cancelledBy?: MatchFeeCancelledBy },
  ): Promise<void> {
    const row = await this.prisma.matchFeeRefund.findUnique({
      where: { id: refundId },
      include: {
        invoice: {
          include: {
            jobPosting: { select: { title: true, hostProfileId: true } },
            hostProfile: {
              select: { userId: true, user: { select: { email: true } } },
            },
          },
        },
      },
    });
    if (!row || row.status !== 'SUCCEEDED') return;

    const already = await this.prisma.matchFeeInvoiceEvent.findFirst({
      where: {
        invoiceId: row.invoiceId,
        eventType: 'REFUNDED',
        detail: { contains: row.id },
      },
      select: { id: true },
    });
    if (already) return;

    const approvedBy = row.requestedByAdminEmail ?? 'an admin';
    const taxNote =
      row.taxCents > 0 ? ` (includes ${formatCad(row.taxCents)} HST)` : '';

    if (row.kind === 'DUPLICATE_PAYMENT') {
      if (row.paymentAttemptId) {
        await this.updateAttempt(row.paymentAttemptId, {
          completedAt: new Date(),
          failureReason: `Extra payment refunded by ${approvedBy} (Stripe ${row.stripeRefundId ?? 'n/a'}).`,
        });
      }
      await this.recordMatchFeeEvent(row.invoiceId, 'REFUNDED', {
        detail: `Extra payment of ${formatCad(row.amountCents)} refunded (Stripe ${row.stripeRefundId ?? 'n/a'}; refund ${row.id}). Approved by ${approvedBy}.`,
        actor: 'ADMIN',
      });
      return;
    }

    const invoice = row.invoice;
    const total = matchFeeTotalCents(invoice);
    const fullyRefunded = invoice.refundedCents >= total;
    const cancelledBy = opts?.cancelledBy ?? invoice.cancelledBy ?? 'ADMIN';

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoice.id },
      data: {
        status: fullyRefunded ? 'REFUNDED' : undefined,
        refundResolution: 'REFUND',
        stripeRefundId: row.stripeRefundId ?? undefined,
        cancelledAt: fullyRefunded ? new Date() : undefined,
        cancelledBy: fullyRefunded ? cancelledBy : undefined,
      },
    });

    const stripeNote = row.stripeRefundId
      ? ` to the original payment method (Stripe ${row.stripeRefundId})`
      : '';
    await this.recordMatchFeeEvent(invoice.id, 'REFUNDED', {
      detail: `Refunded ${formatCad(row.amountCents)}${taxNote}${stripeNote}${fullyRefunded ? '' : ' (partial)'} (refund ${row.id}). Approved by ${approvedBy}.`,
      actor: cancellationActorToEventActor(cancelledBy),
    });

    const host = invoice.hostProfile;
    if (opts?.notifyHost !== false && host?.userId && host.user?.email) {
      await this.notifications
        .notifyHostMatchFeeRefund({
          recipientId: host.userId,
          recipientEmail: host.user.email,
          jobTitle: invoice.jobPosting.title,
          invoiceId: invoice.id,
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `Refund notification failed for invoice ${invoice.id}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    await this.syncHostReviewFlag(invoice.jobPosting.hostProfileId);
  }

  /** Admin action: refund a payment that arrived after the invoice was already settled. */
  async refundDuplicatePayment(attemptId: string, admin: RefundAdmin, reason: string) {
    const trimmedReason = requireRefundReason(reason);
    const { attempt, refund } = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.matchFeePaymentAttempt.findUnique({
        where: { id: attemptId },
        include: {
          invoice: { select: { amountCents: true, taxCents: true } },
        },
      });
      if (!attempt) throw new NotFoundException('Payment attempt not found');
      if (attempt.status !== 'DUPLICATE' || !attempt.stripePaymentIntentId) {
        throw new BadRequestException('This payment is not an extra payment awaiting refund.');
      }
      const claimed = await tx.matchFeePaymentAttempt.updateMany({
        where: { id: attempt.id, status: 'DUPLICATE' },
        data: { status: 'DUPLICATE_REFUNDED' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This payment is already being refunded.');
      }
      const taxCents =
        attempt.amountCents === matchFeeTotalCents(attempt.invoice)
          ? attempt.invoice.taxCents
          : 0;
      const refund = await tx.matchFeeRefund.create({
        data: {
          invoiceId: attempt.invoiceId,
          paymentAttemptId: attempt.id,
          kind: 'DUPLICATE_PAYMENT',
          amountCents: attempt.amountCents,
          taxCents,
          currency: attempt.currency,
          stripePaymentIntentId: attempt.stripePaymentIntentId,
          reason: trimmedReason,
          requestedByAdminId: admin.id,
          requestedByAdminEmail: admin.email,
        },
      });
      return { attempt, refund };
    });

    const stripeRefund = await this.createStripeRefund(refund.id, {
      paymentIntentId: attempt.stripePaymentIntentId!,
      amountCents: refund.amountCents,
      invoiceId: attempt.invoiceId,
    });

    if (stripeRefund.status !== 'succeeded') {
      await this.recordMatchFeeEvent(attempt.invoiceId, 'ADMIN_NOTE', {
        detail: `Extra payment refund of ${formatCad(refund.amountCents)} submitted to Stripe (${stripeRefund.id}); waiting for confirmation. Approved by ${admin.email}.`,
        actor: 'ADMIN',
      });
    }
    return { success: true };
  }

  /**
   * Calls Stripe for a reserved refund row. Definitive Stripe errors release the reservation;
   * network or Stripe outages leave the row REQUESTED so reconciliation retries it safely.
   */
  private async createStripeRefund(
    refundId: string,
    params: { paymentIntentId: string; amountCents: number; invoiceId: string },
  ): Promise<Stripe.Refund> {
    let stripeRefund: Stripe.Refund;
    try {
      stripeRefund = await this.stripeService.refundMatchFeePayment({
        refundId,
        ...params,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRetryableStripeError(err)) {
        this.logger.error(`Stripe refund ${refundId} not confirmed, will retry: ${message}`);
        throw new ServiceUnavailableException(
          'Stripe did not respond. The refund is recorded and will be retried automatically.',
        );
      }
      await this.failRefund(refundId, `Stripe rejected the refund: ${message}`);
      throw new BadRequestException(`Stripe could not process the refund: ${message}`);
    }

    const outcome = await this.applyStripeRefund(stripeRefund);
    if (outcome === 'failed') {
      throw new BadRequestException(
        `Stripe declined the refund${stripeRefund.failure_reason ? `: ${stripeRefund.failure_reason}` : '.'}`,
      );
    }
    return stripeRefund;
  }

  /** Applies Stripe's refund state (from the API, a webhook or reconciliation) to our refund row. */
  private async applyStripeRefund(
    refund: Stripe.Refund,
  ): Promise<'succeeded' | 'pending' | 'failed' | 'unknown'> {
    const refundRowId = refund.metadata?.matchFeeRefundId;
    const row = await this.prisma.matchFeeRefund.findFirst({
      where: {
        OR: [
          { stripeRefundId: refund.id },
          ...(refundRowId ? [{ id: refundRowId }] : []),
        ],
      },
    });
    if (!row) return 'unknown';

    if (refund.status === 'failed' || refund.status === 'canceled') {
      await this.failRefund(
        row.id,
        refund.failure_reason
          ? `Stripe refund ${refund.status}: ${refund.failure_reason}`
          : `Stripe refund ${refund.status}.`,
        { stripeRefundId: refund.id, status: refund.status === 'failed' ? 'FAILED' : 'CANCELED' },
      );
      return 'failed';
    }

    const succeeded = refund.status === 'succeeded';
    const wasAlreadySucceeded = row.status === 'SUCCEEDED';
    await this.prisma.matchFeeRefund.updateMany({
      where: { id: row.id, status: { in: ['REQUESTED', 'PENDING', 'SUCCEEDED'] } },
      data: {
        stripeRefundId: refund.id,
        status: succeeded ? 'SUCCEEDED' : 'PENDING',
        completedAt: succeeded ? (row.completedAt ?? new Date()) : null,
      },
    });
    if (succeeded && !wasAlreadySucceeded) {
      await this.finalizeSuccessfulRefund(row.id);
    }
    return succeeded ? 'succeeded' : 'pending';
  }

  /** Marks a refund failed once and gives the reserved amount back to the invoice. */
  private async failRefund(
    refundId: string,
    reason: string,
    extra?: { stripeRefundId?: string; status?: 'FAILED' | 'CANCELED' },
  ): Promise<void> {
    const released = await this.prisma.matchFeeRefund.updateMany({
      where: { id: refundId, status: { notIn: ['FAILED', 'CANCELED'] } },
      data: {
        status: extra?.status ?? 'FAILED',
        failureReason: reason.slice(0, 2000),
        ...(extra?.stripeRefundId ? { stripeRefundId: extra.stripeRefundId } : {}),
      },
    });
    if (released.count === 0) return;

    const row = await this.prisma.matchFeeRefund.findUniqueOrThrow({
      where: { id: refundId },
      include: {
        invoice: {
          select: {
            amountCents: true,
            taxCents: true,
            hostProfile: { select: { practiceName: true } },
            jobPosting: { select: { title: true } },
          },
        },
      },
    });

    if (row.kind === 'DUPLICATE_PAYMENT') {
      if (row.paymentAttemptId) {
        await this.prisma.matchFeePaymentAttempt.updateMany({
          where: { id: row.paymentAttemptId, status: 'DUPLICATE_REFUNDED' },
          data: { status: 'DUPLICATE' },
        });
      }
    } else {
      const updated = await this.prisma.matchFeeInvoice.update({
        where: { id: row.invoiceId },
        data: { refundedCents: { decrement: row.amountCents } },
      });
      const stillOwesRefund =
        updated.refundedCents < matchFeeTotalCents(updated) &&
        row.kind !== 'POST_COMPLETION';
      if (
        stillOwesRefund &&
        (updated.status === 'REFUNDED' || updated.refundResolution === 'REFUND')
      ) {
        // Restore "refund due" so an admin can retry (including when Stripe was still pending).
        await this.prisma.matchFeeInvoice.update({
          where: { id: row.invoiceId },
          data: {
            status: updated.status === 'REFUNDED' ? 'PAID' : undefined,
            refundResolution: 'PENDING',
          },
        });
      }
    }

    await this.recordMatchFeeEvent(row.invoiceId, 'REFUND_FAILED', {
      detail: `Refund of ${formatCad(row.amountCents)} did not go through. ${reason}`,
    });
    this.logger.error(`Match fee refund ${refundId} failed: ${reason}`);
    await this.adminNotifications
      .notifyMatchFeeOutcome({
        invoiceId: row.invoiceId,
        hostPracticeName: row.invoice.hostProfile.practiceName,
        jobTitle: row.invoice.jobPosting.title,
        outcome: 'REFUND_FAILED',
        detail: `Refund of ${formatCad(row.amountCents)} failed. ${reason}`,
      })
      .catch(() => undefined);
  }

  /** Safety net for refunds whose Stripe result we never recorded (timeouts, missed webhooks). */
  async reconcileRefunds(now = new Date()) {
    const result = { checked: 0, succeeded: 0, failed: 0 };
    if (!this.stripeService.isEnabled()) return result;

    const rows = await this.prisma.matchFeeRefund.findMany({
      where: {
        status: { in: ['REQUESTED', 'PENDING'] },
        stripePaymentIntentId: { not: null },
        updatedAt: { lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const row of rows) {
      result.checked += 1;
      try {
        let refund: Stripe.Refund | null = row.stripeRefundId
          ? await this.stripeService.retrieveRefund(row.stripeRefundId)
          : await this.stripeService.findRefundForRow(row.stripePaymentIntentId!, row.id);
        if (!refund) {
          if (now.getTime() - row.createdAt.getTime() > REFUND_RETRY_WINDOW_MS) {
            await this.failRefund(row.id, 'Stripe never created this refund.');
            result.failed += 1;
            continue;
          }
          refund = await this.stripeService.refundMatchFeePayment({
            refundId: row.id,
            paymentIntentId: row.stripePaymentIntentId!,
            amountCents: row.amountCents,
            invoiceId: row.invoiceId,
          });
        }
        const outcome = await this.applyStripeRefund(refund);
        if (outcome === 'succeeded') result.succeeded += 1;
        if (outcome === 'failed') result.failed += 1;
      } catch (err) {
        if (!isRetryableStripeError(err) && !row.stripeRefundId) {
          await this.failRefund(
            row.id,
            `Stripe rejected the refund: ${err instanceof Error ? err.message : String(err)}`,
          );
          result.failed += 1;
          continue;
        }
        this.logger.warn(
          `Refund reconcile failed for ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return result;
  }

  async createMatchFeeInvoice(applicationId: string): Promise<void> {
    const existingByApp = await this.prisma.matchFeeInvoice.findUnique({
      where: {
        applicationId_kind: { applicationId, kind: 'PRIMARY' },
      },
      select: {
        id: true,
        status: true,
      },
    });
    // One invoice row per application. Active invoices are idempotent; after a
    // prior cycle ended (refund/cancel), recycle the row for the new accept.
    const terminalStatuses: MatchFeeInvoiceStatus[] = [
      'REFUNDED',
      'CANCELLED',
      'CREDITED',
    ];
    if (existingByApp && !terminalStatuses.includes(existingByApp.status)) {
      return;
    }

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

    if (
      isPostingGrandfatheredFromMatchFee(
        platformCalendarDateOf(app.jobPosting.createdAt),
      )
    ) {
      return;
    }

    // If this posting is seeking a replacement for a prior paid invoice, close
    // that search only when *this* accept is a real replacement (accepted after
    // the cancel) — not a prior co-locum who already had a paid invoice.
    // Replacement does NOT generate a second invoice; the original fee stands.
    const seekingReplacement = await this.prisma.matchFeeInvoice.findFirst({
      where: {
        jobPostingId: app.jobPostingId,
        kind: 'PRIMARY',
        id: existingByApp ? { not: existingByApp.id } : undefined,
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
      await this.markReplacementFound(seekingReplacement.id, applicationId);
      return;
    }

    const claimedHours = computeApplicationClaimedHours(app.jobPosting, {
      availabilityKind: app.availabilityKind,
      availableDates: app.availableDates,
      requestedShiftIds: app.requestedShiftIds,
      shiftClaims: app.shiftClaims,
    });
    const amountCents = computeMatchFeeAmountCents(claimedHours);
    const taxRateBps = MATCH_FEE_HST_RATE_BPS;
    const taxCents = computeMatchFeeTaxCents(amountCents, taxRateBps);
    const matchFeeTier = matchFeeTierFromHours(claimedHours);

    const createdAt = new Date();
    const earliestShiftDate = computeEarliestShiftDate(app.jobPosting, app);
    const dueAt = computeDueAt(createdAt, earliestShiftDate);

    const invoiceData = {
      hostProfileId: app.jobPosting.hostProfileId,
      jobPostingId: app.jobPostingId,
      amountCents,
      taxRateBps,
      taxCents,
      refundedCents: 0,
      claimedHours,
      matchFeeTier,
      currency: MATCH_FEE_CURRENCY,
      dueAt,
      status: 'PENDING' as const,
      paidAt: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      refundResolution: 'NONE' as const,
      replacementStatus: 'NONE' as const,
      replacementApplicationId: null,
      escalatedAt: null,
      paymentProvider: null,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      stripeRefundId: null,
      lastReminderAt: null,
    };

    const invoice = existingByApp
      ? await this.prisma.matchFeeInvoice.update({
          where: { id: existingByApp.id },
          data: invoiceData,
          include: invoiceInclude,
        })
      : await this.prisma.matchFeeInvoice.create({
          data: {
            applicationId,
            kind: 'PRIMARY',
            ...invoiceData,
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
        amountCents: amountCents + taxCents,
        taxCents,
      });
    }

    const tierLabel = matchFeeTier === 'HALF' ? 'Half-day' : 'Full-day';
    const priceText = `${tierLabel} match fee ${formatCad(amountCents)} + ${formatCad(taxCents)} HST = ${formatCad(amountCents + taxCents)}`;
    await this.recordMatchFeeEvent(invoice.id, 'INVOICED', {
      detail: existingByApp
        ? `Re-invoiced after prior cycle closed — ${app.jobPosting.title} · ${claimedHours}h · ${priceText}`
        : `${app.jobPosting.title} · ${claimedHours}h · ${priceText}`,
    });
  }

  /**
   * After a placement ends: if the locum's claimed hours rose from half-day to
   * full-day since the PRIMARY invoice, either bump an unpaid primary or create
   * a TIER_TOP_UP invoice for the fee delta and notify the host.
   */
  async reconcileTierTopUpsAfterCompletion(jobPostingIds?: string[]): Promise<{
    topUpsCreated: number;
    primariesUpdated: number;
  }> {
    const result = { topUpsCreated: 0, primariesUpdated: 0 };
    const today = platformCalendarDateToday();
    const candidates = await this.prisma.matchFeeInvoice.findMany({
      where: {
        kind: 'PRIMARY',
        matchFeeTier: 'HALF',
        status: { in: ['PENDING', 'OVERDUE', 'PAID'] },
        ...(jobPostingIds?.length ? { jobPostingId: { in: jobPostingIds } } : {}),
        application: {
          status: 'CONFIRMED',
          locumAcceptedAt: { not: null },
        },
      },
      include: {
        application: {
          select: {
            id: true,
            availabilityKind: true,
            availableDates: true,
            requestedShiftIds: true,
            shiftClaims: { select: { shiftId: true } },
          },
        },
        jobPosting: {
          select: {
            id: true,
            title: true,
            status: true,
            endDate: true,
            startDate: true,
            startTime: true,
            endTime: true,
            scheduleModel: true,
            hostProfileId: true,
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

    for (const primary of candidates) {
      const postingEnded =
        primary.jobPosting.status === 'COMPLETED' ||
        (primary.jobPosting.endDate != null &&
          platformCalendarDateOf(primary.jobPosting.endDate) < today);
      if (!postingEnded) continue;

      const liveHours = computeApplicationClaimedHours(primary.jobPosting, {
        availabilityKind: primary.application.availabilityKind,
        availableDates: primary.application.availableDates,
        requestedShiftIds: primary.application.requestedShiftIds,
        shiftClaims: primary.application.shiftClaims,
      });
      if (matchFeeTierFromHours(liveHours) !== 'FULL') continue;

      const fullFeeCents = MATCH_FEE_FULL_CENTS;
      const deltaFeeCents = fullFeeCents - primary.amountCents;
      if (deltaFeeCents <= 0) continue;

      const taxRateBps =
        primary.taxRateBps > 0 ? primary.taxRateBps : MATCH_FEE_HST_RATE_BPS;

      if (primary.status === 'PENDING' || primary.status === 'OVERDUE') {
        const taxCents = computeMatchFeeTaxCents(fullFeeCents, taxRateBps);
        await this.prisma.matchFeeInvoice.update({
          where: { id: primary.id },
          data: {
            amountCents: fullFeeCents,
            taxCents,
            taxRateBps,
            claimedHours: liveHours,
            matchFeeTier: 'FULL',
          },
        });
        await this.recordMatchFeeEvent(primary.id, 'INVOICED', {
          detail: `After placement ended, claimed hours rose to ${liveHours}h (full-day). Invoice updated to ${formatCad(fullFeeCents)} + ${formatCad(taxCents)} HST = ${formatCad(fullFeeCents + taxCents)}.`,
        });
        const host = primary.jobPosting.hostProfile;
        if (host?.userId && host.user?.email) {
          await this.notifications.notifyHostMatchFeeTierTopUp({
            recipientId: host.userId,
            recipientEmail: host.user.email,
            jobTitle: primary.jobPosting.title,
            dueAt: primary.dueAt,
            invoiceId: primary.id,
            applicationId: primary.applicationId,
            amountCents: fullFeeCents + taxCents,
            taxCents,
            updatedExisting: true,
          });
        }
        result.primariesUpdated += 1;
        continue;
      }

      // PAID half-day → separate top-up for the delta.
      const existingTopUp = await this.prisma.matchFeeInvoice.findUnique({
        where: {
          applicationId_kind: {
            applicationId: primary.applicationId,
            kind: 'TIER_TOP_UP',
          },
        },
        select: { id: true },
      });
      if (existingTopUp) continue;

      const taxCents = computeMatchFeeTaxCents(deltaFeeCents, taxRateBps);
      const createdAt = new Date();
      const dueAt = computeDueAt(createdAt, null);
      const topUp = await this.prisma.matchFeeInvoice.create({
        data: {
          applicationId: primary.applicationId,
          kind: 'TIER_TOP_UP',
          hostProfileId: primary.hostProfileId,
          jobPostingId: primary.jobPostingId,
          amountCents: deltaFeeCents,
          taxRateBps,
          taxCents,
          refundedCents: 0,
          claimedHours: liveHours,
          matchFeeTier: 'FULL',
          currency: MATCH_FEE_CURRENCY,
          dueAt,
          status: 'PENDING',
        },
      });
      await this.recordMatchFeeEvent(topUp.id, 'INVOICED', {
        detail: `Tier top-up after placement ended — claimed hours ${liveHours}h (full-day). Additional match fee ${formatCad(deltaFeeCents)} + ${formatCad(taxCents)} HST = ${formatCad(deltaFeeCents + taxCents)} (original half-day invoice ${primary.id.slice(-8)} already paid).`,
      });
      await this.recordMatchFeeEvent(primary.id, 'ADMIN_NOTE', {
        detail: `Tier top-up invoice ${topUp.id.slice(-8)} issued for ${formatCad(deltaFeeCents + taxCents)} after claimed hours rose to ${liveHours}h.`,
      });

      const host = primary.jobPosting.hostProfile;
      if (host?.userId && host.user?.email) {
        await this.notifications.notifyHostMatchFeeTierTopUp({
          recipientId: host.userId,
          recipientEmail: host.user.email,
          jobTitle: primary.jobPosting.title,
          dueAt,
          invoiceId: topUp.id,
          applicationId: primary.applicationId,
          amountCents: deltaFeeCents + taxCents,
          taxCents,
          updatedExisting: false,
        });
      }
      result.topUpsCreated += 1;
    }

    return result;
  }

  /**
   * When a replacement locum accepts, mark the prior invoice's replacement
   * search as FOUND. The original paid fee stands — no second invoice.
   */
  async registerReplacementLocumAccepted(applicationId: string): Promise<void> {
    await this.completeReplacementAcceptance(applicationId);
  }

  private async markReplacementFound(
    invoiceId: string,
    replacementApplicationId: string,
  ): Promise<void> {
    const [original, replacement] = await Promise.all([
      this.prisma.matchFeeInvoice.findUnique({
        where: { id: invoiceId },
        select: {
          application: {
            select: {
              locumProfile: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.application.findUnique({
        where: { id: replacementApplicationId },
        select: {
          locumProfile: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const originalName = formatLocumName(
      original?.application.locumProfile.firstName,
      original?.application.locumProfile.lastName,
    );
    const replacementName = formatLocumName(
      replacement?.locumProfile.firstName,
      replacement?.locumProfile.lastName,
    );

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        replacementStatus: 'FOUND',
        refundResolution: 'NONE',
        replacementApplicationId,
      },
    });
    await this.recordMatchFeeEvent(invoiceId, 'REPLACEMENT_FOUND', {
      detail: `${replacementName} replaced ${originalName}. Original match fee remains paid. No additional invoice.`,
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
        kind: 'PRIMARY',
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

    await this.markReplacementFound(replacementInvoice.id, app.id);
  }

  /** Fix invoices left in PENDING_REPLACEMENT after a locum already re-confirmed on the posting. */
  private async syncStuckReplacementInvoices(hostProfileId: string): Promise<void> {
    const stuck = await this.prisma.matchFeeInvoice.findMany({
      where: { hostProfileId, status: 'PENDING_REPLACEMENT', kind: 'PRIMARY' },
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
    query: { cursor?: string; limit?: number; status?: string; jobPostingId?: string },
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
      ...(query.jobPostingId ? { jobPostingId: query.jobPostingId } : {}),
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
        matchFeeInvoices: { where: { kind: 'PRIMARY' }, take: 1 },
      },
    });
    if (!app) return;

    // A replacement locum has no invoice of their own; they are covered by the
    // original invoice they replaced, so their cancellation reopens that one.
    const invoice = await this.prisma.matchFeeInvoice.findFirst({
      where: {
        OR: [
          { applicationId: app.id, kind: 'PRIMARY' },
          { replacementApplicationId: app.id },
        ],
        status: { in: ['PENDING', 'OVERDUE', 'PAID', 'PENDING_REPLACEMENT'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invoice) return;
    if (isRefundPendingReview(invoice) && invoice.cancelledAt) return;
    const cancelledByReplacement = invoice.replacementApplicationId === app.id;

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
      // Refunds are never automatic: the invoice stays PAID and waits for an admin to approve it.
      await this.prisma.matchFeeInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          cancelledAt: new Date(),
          cancelledBy: params.cancelledBy as MatchFeeCancelledBy,
          cancellationReason: policy.reason,
          refundResolution: 'PENDING',
          replacementStatus: 'NONE',
          ...(cancelledByReplacement ? { replacementApplicationId: null } : {}),
        },
      });
      if (jobRemoved) {
        await this.recordMatchFeeEvent(invoice.id, 'POSTING_REMOVED', {
          detail: params.reason ?? 'Host removed the job posting.',
          actor: 'HOST',
        });
      }
      const refundable = Math.max(0, matchFeeTotalCents(invoice) - invoice.refundedCents);
      await this.recordMatchFeeEvent(invoice.id, 'REFUND_PENDING_REVIEW', {
        detail: `${policy.reason} LocumLink will review and refund ${formatCad(refundable)}.`,
        actor,
      });
      await this.adminNotifications.notifyMatchFeeOutcome({
        invoiceId: invoice.id,
        hostPracticeName: host?.practiceName ?? 'Host',
        jobTitle: app.jobPosting.title,
        outcome: 'REFUND_DUE',
        detail: `${policy.reason} Approve the ${formatCad(refundable)} refund in admin Match Fees.`,
      });
      if (host?.userId && host.user?.email) {
        await this.notifications.notifyHostMatchFeeCancelled({
          recipientId: host.userId,
          recipientEmail: host.user.email,
          jobTitle: app.jobPosting.title,
          reason: `${policy.reason} Your refund is being reviewed by LocumLink and will go back to your original payment method once approved.`,
          invoiceId: invoice.id,
        });
      }
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
        ...(cancelledByReplacement ? { replacementApplicationId: null } : {}),
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
        data: { status: 'OVERDUE', lastReminderAt: now },
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
          amountCents: matchFeeTotalCents(invoice),
          taxCents: invoice.taxCents,
        });
      }
      await this.syncHostReviewFlag(invoice.hostProfileId);
    }
  }

  /**
   * Re-notifies hosts with overdue unpaid match fees on a fixed interval until paid or escalated.
   * The first overdue notification is sent by markOverdueInvoices; this covers follow-ups.
   */
  async sendRecurringOverdueReminders(now = new Date()) {
    const cutoff = new Date(
      now.getTime() - MATCH_FEE_OVERDUE_REMINDER_INTERVAL_DAYS * 24 * 60 * 60_000,
    );
    const overdue = await this.prisma.matchFeeInvoice.findMany({
      where: {
        status: 'OVERDUE',
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }],
      },
      include: {
        jobPosting: { select: { title: true } },
        hostProfile: {
          select: {
            userId: true,
            user: { select: { email: true } },
          },
        },
      },
      take: 100,
    });

    let sent = 0;
    for (const invoice of overdue) {
      const host = invoice.hostProfile;
      if (!host?.userId || !host.user?.email) continue;

      await this.notifications.notifyHostMatchFeePaymentReminder({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: invoice.jobPosting.title,
        jobPostingId: invoice.jobPostingId,
        dueAt: invoice.dueAt,
        invoiceId: invoice.id,
        amountCents: matchFeeTotalCents(invoice),
        taxCents: invoice.taxCents,
        status: 'OVERDUE',
        sendEmail: true,
        sendNotification: true,
      });

      await this.prisma.matchFeeInvoice.update({
        where: { id: invoice.id },
        data: { lastReminderAt: now },
      });
      await this.recordMatchFeeEvent(invoice.id, 'PAYMENT_REMINDER', {
        detail: 'Automated overdue reminder (email + in-app)',
        actor: 'SYSTEM',
      });
      sent += 1;
    }
    return { sent };
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
        amountCents: matchFeeTotalCents(invoice),
        taxCents: invoice.taxCents,
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
      include: adminInvoiceInclude,
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
        _sum: { amountCents: true, taxCents: true },
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
        amountCents:
          (receivedSum._sum.amountCents ?? 0) + (receivedSum._sum.taxCents ?? 0),
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

    const reminderStatus = invoice.status as 'PENDING' | 'OVERDUE';

    if (options.sendNotification || options.sendEmail) {
      await this.notifications.notifyHostMatchFeePaymentReminder({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: invoice.jobPosting.title,
        jobPostingId: invoice.jobPostingId,
        dueAt: invoice.dueAt,
        invoiceId: invoice.id,
        amountCents: matchFeeTotalCents(invoice),
        taxCents: invoice.taxCents,
        status: reminderStatus,
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
      throw new BadRequestException(
        'Online payments are not available right now. Please try again later.',
      );
    }

    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found');

    // Serialize checkout creation per invoice so parallel clicks cannot open two sessions.
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM match_fee_invoices WHERE id = ${invoiceId} FOR UPDATE`;

      const invoice = await tx.matchFeeInvoice.findFirst({
        where: { id: invoiceId, hostProfileId: hostProfile.id },
        include: { jobPosting: { select: { title: true } } },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) {
        throw new BadRequestException('This invoice cannot be paid in its current state.');
      }

      const totalCents = matchFeeTotalCents(invoice);
      const now = Date.now();
      const openAttempts = await tx.matchFeePaymentAttempt.findMany({
        where: { invoiceId: invoice.id, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });

      const reusable = openAttempts.find(
        (a) =>
          a.checkoutUrl &&
          a.stripeCheckoutSessionId &&
          a.expiresAt &&
          a.expiresAt.getTime() - now > CHECKOUT_REUSE_MIN_REMAINING_MS &&
          a.amountCents === totalCents &&
          a.currency === invoice.currency,
      );
      if (reusable?.checkoutUrl && reusable.stripeCheckoutSessionId) {
        return {
          kind: 'reuse' as const,
          url: reusable.checkoutUrl,
          attemptId: reusable.id,
          sessionId: reusable.stripeCheckoutSessionId,
          invoice,
          totalCents,
          now,
          openAttempts,
        };
      }

      const creating = openAttempts.find(
        (a) =>
          !a.stripeCheckoutSessionId &&
          now - a.createdAt.getTime() < CHECKOUT_CREATE_IN_FLIGHT_MS,
      );
      if (creating) {
        throw new ConflictException(
          'A checkout for this invoice is already being prepared. Please wait a moment and try again.',
        );
      }

      return {
        kind: 'create' as const,
        invoice,
        totalCents,
        now,
        openAttempts,
      };
    });

    // Never reuse a Checkout URL from the other Stripe mode (e.g. sk_test → rk_live switch).
    if (claim.kind === 'reuse') {
      try {
        const session = await this.stripeService.retrieveCheckoutSession(
          claim.sessionId,
        );
        if (
          Boolean(session.livemode) === this.stripeService.isLiveMode() &&
          session.status === 'open'
        ) {
          return { success: true, url: session.url ?? claim.url };
        }
        await this.updateAttempt(claim.attemptId, {
          status: 'SUPERSEDED',
          lastEventType: 'checkout.mode_mismatch',
          failureReason:
            Boolean(session.livemode) !== this.stripeService.isLiveMode()
              ? 'Prior checkout was created in a different Stripe mode.'
              : 'Prior checkout is no longer open.',
        });
      } catch (err) {
        this.logger.warn(
          `Discarding reusable checkout ${claim.sessionId} (mode switch or invalid session)`,
          err,
        );
        await this.updateAttempt(claim.attemptId, {
          status: 'SUPERSEDED',
          lastEventType: 'checkout.mode_mismatch',
          failureReason:
            'Prior checkout could not be verified after a Stripe key/mode change.',
        });
      }
    }

    const { invoice, totalCents, now, openAttempts } =
      claim.kind === 'reuse'
        ? {
            invoice: claim.invoice,
            totalCents: claim.totalCents,
            now: claim.now,
            openAttempts: claim.openAttempts.filter(
              (a) => a.id !== claim.attemptId,
            ),
          }
        : claim;

    for (const stale of openAttempts) {
      if (!stale.stripeCheckoutSessionId) {
        await this.updateAttempt(stale.id, {
          status: 'FAILED',
          failureReason: 'Checkout session was never created.',
        });
        continue;
      }
      try {
        const session = await this.stripeService.expireCheckoutSession(
          stale.stripeCheckoutSessionId,
        );
        if (session.status === 'complete') {
          const outcome = await this.applyCheckoutSession(session, 'checkout.supersede');
          if (outcome === 'processing') {
            throw new BadRequestException(
              'A payment for this invoice is still processing. Please check back shortly.',
            );
          }
          if (outcome === 'paid' || outcome === 'already-paid') {
            throw new BadRequestException('This invoice has already been paid.');
          }
          continue;
        }
        await this.updateAttempt(stale.id, {
          status: session.status === 'expired' ? 'SUPERSEDED' : 'OPEN',
          lastEventType: 'checkout.supersede',
        });
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // Live key cannot expire/retrieve a test-mode session (and vice versa).
        this.logger.warn(
          `Could not expire checkout ${stale.stripeCheckoutSessionId}; superseding locally`,
          err,
        );
        await this.updateAttempt(stale.id, {
          status: 'SUPERSEDED',
          lastEventType: 'checkout.supersede',
          failureReason:
            'Prior checkout could not be expired (Stripe mode mismatch).',
        });
      }
    }

    // Re-lock briefly to create the attempt row so a concurrent request sees in-flight state.
    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM match_fee_invoices WHERE id = ${invoice.id} FOR UPDATE`;
      const fresh = await tx.matchFeeInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { status: true },
      });
      if (!PAYABLE_INVOICE_STATUSES.includes(fresh.status)) {
        throw new BadRequestException('This invoice cannot be paid in its current state.');
      }

      const stillOpen = await tx.matchFeePaymentAttempt.findMany({
        where: { invoiceId: invoice.id, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
      const reusable = stillOpen.find(
        (a) =>
          a.checkoutUrl &&
          a.stripeCheckoutSessionId &&
          a.expiresAt &&
          a.expiresAt.getTime() - Date.now() > CHECKOUT_REUSE_MIN_REMAINING_MS &&
          a.amountCents === totalCents &&
          a.currency === invoice.currency,
      );
      if (reusable?.checkoutUrl) {
        return { kind: 'reuse' as const, url: reusable.checkoutUrl };
      }
      const creating = stillOpen.find(
        (a) =>
          !a.stripeCheckoutSessionId &&
          Date.now() - a.createdAt.getTime() < CHECKOUT_CREATE_IN_FLIGHT_MS,
      );
      if (creating) {
        throw new ConflictException(
          'A checkout for this invoice is already being prepared. Please wait a moment and try again.',
        );
      }

      const created = await tx.matchFeePaymentAttempt.create({
        data: {
          invoiceId: invoice.id,
          hostProfileId: invoice.hostProfileId,
          amountCents: totalCents,
          currency: invoice.currency,
          expiresAt: new Date(now + this.stripeService.getCheckoutExpiryMinutes() * 60_000),
        },
      });
      return { kind: 'created' as const, attempt: created };
    });

    if (attempt.kind === 'reuse') {
      return { success: true, url: attempt.url };
    }

    const expiresAt = new Date(
      now + this.stripeService.getCheckoutExpiryMinutes() * 60_000,
    );

    let checkout: { url: string; sessionId: string; expiresAt: Date };
    try {
      checkout = await this.stripeService.createMatchFeeCheckoutSession({
        attemptId: attempt.attempt.id,
        invoiceId: invoice.id,
        hostProfileId: invoice.hostProfileId,
        feeCents: invoice.amountCents,
        taxCents: invoice.taxCents,
        taxLabel: `HST (${formatTaxRate(invoice.taxRateBps)})`,
        currency: invoice.currency,
        jobTitle: invoice.jobPosting.title,
        expiresAt,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.updateAttempt(attempt.attempt.id, {
        status: 'FAILED',
        failureReason: reason.slice(0, 2000),
      });
      this.logger.error(
        `Stripe checkout creation failed for invoice ${invoice.id}: ${reason}`,
      );
      throw new BadRequestException('Could not start checkout. Please try again.');
    }

    await this.prisma.$transaction([
      this.prisma.matchFeePaymentAttempt.update({
        where: { id: attempt.attempt.id },
        data: {
          stripeCheckoutSessionId: checkout.sessionId,
          checkoutUrl: checkout.url,
          expiresAt: checkout.expiresAt,
          lastEventType: 'checkout.session.created',
        },
      }),
      this.prisma.matchFeeInvoice.update({
        where: { id: invoice.id },
        data: { stripeCheckoutSessionId: checkout.sessionId },
      }),
    ]);

    return { success: true, url: checkout.url };
  }

  /** Host returned from Checkout: confirm with Stripe directly instead of waiting for the webhook. */
  async syncHostInvoicePayment(userId: string, invoiceId: string) {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found');
    const invoice = await this.prisma.matchFeeInvoice.findFirst({
      where: { id: invoiceId, hostProfileId: hostProfile.id },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (this.stripeService.isEnabled()) {
      const attempts = await this.prisma.matchFeePaymentAttempt.findMany({
        where: {
          invoiceId: invoice.id,
          status: 'OPEN',
          stripeCheckoutSessionId: { not: null },
        },
        select: { stripeCheckoutSessionId: true },
      });
      for (const a of attempts) {
        try {
          const session = await this.stripeService.retrieveCheckoutSession(
            a.stripeCheckoutSessionId!,
          );
          await this.applyCheckoutSession(session, 'host.return');
        } catch (err) {
          this.logger.warn(
            `Payment sync failed for session ${a.stripeCheckoutSessionId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return this.getHostInvoice(userId, invoiceId);
  }

  /**
   * Safety net for missed webhooks: asks Stripe for the state of every open Checkout session
   * and applies it (paid, expired). Also closes attempts whose session was never created.
   */
  async reconcileOpenCheckoutSessions(now = new Date()) {
    const result = { checked: 0, paid: 0, expired: 0, orphaned: 0 };
    if (!this.stripeService.isEnabled()) return result;

    const orphans = await this.prisma.matchFeePaymentAttempt.updateMany({
      where: {
        status: 'OPEN',
        stripeCheckoutSessionId: null,
        createdAt: { lt: new Date(now.getTime() - ORPHAN_ATTEMPT_AGE_MS) },
      },
      data: {
        status: 'FAILED',
        failureReason: 'Checkout session was never created.',
      },
    });
    result.orphaned = orphans.count;

    const attempts = await this.prisma.matchFeePaymentAttempt.findMany({
      where: {
        status: 'OPEN',
        stripeCheckoutSessionId: { not: null },
        createdAt: { lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { stripeCheckoutSessionId: true },
    });

    for (const a of attempts) {
      result.checked += 1;
      try {
        const session = await this.stripeService.retrieveCheckoutSession(
          a.stripeCheckoutSessionId!,
        );
        const outcome = await this.applyCheckoutSession(session, 'reconcile');
        if (outcome === 'paid') result.paid += 1;
        if (outcome === 'expired') result.expired += 1;
      } catch (err) {
        this.logger.warn(
          `Reconcile failed for session ${a.stripeCheckoutSessionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (result.paid > 0) {
      this.logger.warn(
        `Stripe reconciliation confirmed ${result.paid} payment(s) that no webhook had confirmed.`,
      );
    }
    return result;
  }

  async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    const objectId = (event.data.object as { id?: string }).id ?? null;

    if (event.livemode !== this.stripeService.isLiveMode()) {
      this.logger.error(
        `Ignoring Stripe event ${event.id}: livemode=${event.livemode} does not match the configured Stripe key.`,
      );
      await this.prisma.stripeWebhookEvent.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          type: event.type,
          livemode: event.livemode,
          objectId,
          status: 'IGNORED',
          error: 'Stripe mode mismatch',
          processedAt: new Date(),
        },
        update: {},
      });
      return;
    }

    if (!(await this.claimWebhookEvent(event, objectId))) return;

    try {
      const handled = await this.dispatchStripeEvent(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: handled ? 'PROCESSED' : 'IGNORED',
          processedAt: new Date(),
          error: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.stripeWebhookEvent
        .update({
          where: { id: event.id },
          data: { status: 'FAILED', error: message.slice(0, 2000) },
        })
        .catch(() => undefined);
      throw err;
    }
  }

  /** Records the event id; returns false when this delivery was already processed. */
  private async claimWebhookEvent(
    event: Stripe.Event,
    objectId: string | null,
  ): Promise<boolean> {
    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          id: event.id,
          type: event.type,
          livemode: event.livemode,
          objectId,
        },
      });
      return true;
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== 'P2002'
      ) {
        throw err;
      }
    }

    const reclaimed = await this.prisma.stripeWebhookEvent.updateMany({
      where: {
        id: event.id,
        OR: [
          { status: 'FAILED' },
          {
            status: 'PROCESSING',
            receivedAt: { lt: new Date(Date.now() - WEBHOOK_PROCESSING_STALE_MS) },
          },
        ],
      },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, error: null },
    });
    if (reclaimed.count > 0) return true;

    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { id: event.id },
      select: { status: true },
    });
    if (existing?.status === 'PROCESSING') {
      throw new ConflictException('This Stripe event is already being processed.');
    }
    return false;
  }

  /** Returns true when the event changed something we track. */
  private async dispatchStripeEvent(event: Stripe.Event): Promise<boolean> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.expired': {
        const outcome = await this.applyCheckoutSession(event.data.object, event.type);
        return outcome !== 'unknown';
      }
      case 'checkout.session.async_payment_failed': {
        const updated = await this.prisma.matchFeePaymentAttempt.updateMany({
          where: { stripeCheckoutSessionId: event.data.object.id, status: 'OPEN' },
          data: {
            status: 'FAILED',
            failureReason: 'The payment could not be completed.',
            lastEventType: event.type,
          },
        });
        return updated.count > 0;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const attemptId = intent.metadata?.paymentAttemptId;
        if (!attemptId) return false;
        const updated = await this.prisma.matchFeePaymentAttempt.updateMany({
          where: { id: attemptId, status: 'OPEN' },
          data: {
            stripePaymentIntentId: intent.id,
            failureReason: (
              intent.last_payment_error?.message ?? 'Payment failed.'
            ).slice(0, 2000),
            lastEventType: event.type,
          },
        });
        return updated.count > 0;
      }
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        const outcome = await this.applyStripeRefund(event.data.object);
        return outcome !== 'unknown';
      }
      default:
        return false;
    }
  }

  private async updateAttempt(
    id: string,
    data: Prisma.MatchFeePaymentAttemptUpdateInput,
  ): Promise<void> {
    await this.prisma.matchFeePaymentAttempt.update({ where: { id }, data });
  }

  private async findAttemptForSession(session: Stripe.Checkout.Session) {
    const bySession = await this.prisma.matchFeePaymentAttempt.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    });
    if (bySession) return bySession;

    const attemptId = session.metadata?.paymentAttemptId;
    if (!attemptId) return null;
    const byId = await this.prisma.matchFeePaymentAttempt.findUnique({
      where: { id: attemptId },
    });
    if (
      !byId ||
      byId.stripeCheckoutSessionId ||
      byId.invoiceId !== session.metadata?.matchFeeInvoiceId
    ) {
      return null;
    }
    return this.prisma.matchFeePaymentAttempt.update({
      where: { id: byId.id },
      data: { stripeCheckoutSessionId: session.id },
    });
  }

  /**
   * Applies a Checkout session's state (from a signed webhook or fetched from Stripe) to its
   * payment attempt and invoice. The invoice is only marked paid when Stripe reports it paid and
   * the amount, currency, invoice and customer all match what we issued.
   */
  private async applyCheckoutSession(
    session: Stripe.Checkout.Session,
    source: string,
  ): Promise<CheckoutOutcome> {
    const attempt = await this.findAttemptForSession(session);
    if (!attempt) {
      this.logger.warn(
        `Stripe session ${session.id} (${source}) does not match any payment attempt.`,
      );
      return 'unknown';
    }

    if (session.status === 'expired') {
      if (attempt.status === 'OPEN' || attempt.status === 'SUPERSEDED') {
        await this.updateAttempt(attempt.id, { status: 'EXPIRED', lastEventType: source });
      }
      return 'expired';
    }
    if (session.status !== 'complete') return 'open';
    if (session.payment_status !== 'paid') {
      await this.updateAttempt(attempt.id, { lastEventType: source });
      return 'processing';
    }
    if (attempt.status === 'PAID') return 'already-paid';
    if (attempt.status === 'REJECTED') return 'rejected';
    if (attempt.status === 'DUPLICATE' || attempt.status === 'DUPLICATE_REFUNDED') {
      return 'duplicate';
    }

    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: attempt.invoiceId },
      select: {
        id: true,
        status: true,
        amountCents: true,
        taxCents: true,
        currency: true,
        hostProfile: { select: { practiceName: true, stripeCustomerId: true } },
        jobPosting: { select: { title: true } },
      },
    });
    if (!invoice) return 'unknown';

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);

    const problems: string[] = [];
    if (session.mode !== 'payment') problems.push(`mode is ${session.mode}`);
    if (session.metadata?.matchFeeInvoiceId !== invoice.id) {
      problems.push('invoice id in metadata does not match');
    }
    const invoiceTotalCents = matchFeeTotalCents(invoice);
    if (
      session.amount_total !== attempt.amountCents ||
      attempt.amountCents !== invoiceTotalCents
    ) {
      problems.push(
        `amount paid ${session.amount_total} does not match invoice total ${invoiceTotalCents}`,
      );
    }
    if ((session.currency ?? '').toLowerCase() !== invoice.currency.toLowerCase()) {
      problems.push(`currency ${session.currency} does not match ${invoice.currency}`);
    }
    if (!customerId) {
      problems.push('no Stripe customer on session');
    } else if (!invoice.hostProfile.stripeCustomerId) {
      problems.push('host has no Stripe customer on file');
    } else if (customerId !== invoice.hostProfile.stripeCustomerId) {
      problems.push('Stripe customer does not match the host');
    }
    if (!paymentIntentId) problems.push('no payment intent on session');

    if (problems.length > 0 || !paymentIntentId) {
      const reason = `Verification failed: ${problems.join('; ')}.`;
      await this.updateAttempt(attempt.id, {
        status: 'REJECTED',
        failureReason: reason,
        stripePaymentIntentId: paymentIntentId,
        lastEventType: source,
      });
      this.logger.error(
        `Stripe session ${session.id} for invoice ${invoice.id} rejected. ${reason}`,
      );
      await this.adminNotifications
        .notifyMatchFeeOutcome({
          invoiceId: invoice.id,
          hostPracticeName: invoice.hostProfile.practiceName,
          jobTitle: invoice.jobPosting.title,
          outcome: 'PAYMENT_REJECTED',
          detail: `A Stripe payment was not applied to the invoice. ${reason} Check Stripe session ${session.id}.`,
        })
        .catch(() => undefined);
      return 'rejected';
    }

    const markPaid = {
      status: 'PAID' as const,
      completedAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      failureReason: null,
      lastEventType: source,
    };

    if (
      await this.markInvoicePaid({
        invoiceId: invoice.id,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      })
    ) {
      await this.updateAttempt(attempt.id, markPaid);
      return 'paid';
    }

    const current = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoice.id },
      select: { status: true, stripePaymentIntentId: true },
    });
    if (current?.stripePaymentIntentId === paymentIntentId) {
      await this.updateAttempt(attempt.id, markPaid);
      return 'already-paid';
    }

    // Money was collected for an invoice that is already settled or no longer payable.
    // It is held for an admin to refund; nothing is refunded automatically.
    const extraCents = session.amount_total ?? attempt.amountCents;
    const detail = `Invoice was ${current?.status ?? 'unavailable'} when this payment of ${formatCad(extraCents)} completed. An admin needs to refund it (Stripe payment ${paymentIntentId}).`;
    const flagged = await this.prisma.matchFeePaymentAttempt.updateMany({
      where: { id: attempt.id, status: { notIn: ['DUPLICATE', 'DUPLICATE_REFUNDED'] } },
      data: {
        status: 'DUPLICATE',
        stripePaymentIntentId: paymentIntentId,
        failureReason: detail,
        lastEventType: source,
      },
    });
    if (flagged.count === 0) return 'duplicate';
    this.logger.warn(`Stripe session ${session.id}: ${detail}`);
    await this.adminNotifications
      .notifyMatchFeeOutcome({
        invoiceId: invoice.id,
        hostPracticeName: invoice.hostProfile.practiceName,
        jobTitle: invoice.jobPosting.title,
        outcome: 'DUPLICATE_PAYMENT_RECEIVED',
        detail,
      })
      .catch(() => undefined);
    return 'duplicate';
  }

  /** Marks a payable invoice PAID. Returns false if it was not payable (already paid, cancelled...). */
  private async markInvoicePaid(params: {
    invoiceId: string;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string;
  }): Promise<boolean> {
    const paidAt = new Date();
    const result = await this.prisma.matchFeeInvoice.updateMany({
      where: { id: params.invoiceId, status: { in: PAYABLE_INVOICE_STATUSES } },
      data: {
        status: 'PAID',
        paidAt,
        paymentProvider: 'STRIPE',
        stripeCheckoutSessionId: params.stripeCheckoutSessionId,
        stripePaymentIntentId: params.stripePaymentIntentId,
      },
    });
    if (result.count === 0) return false;

    const invoice = await this.prisma.matchFeeInvoice.findUniqueOrThrow({
      where: { id: params.invoiceId },
      include: {
        jobPosting: { select: { title: true } },
        hostProfile: {
          select: {
            userId: true,
            practiceName: true,
            user: { select: { email: true } },
          },
        },
        application: {
          select: {
            locumProfile: {
              select: {
                userId: true,
                firstName: true,
                lastName: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    });

    await this.syncHostReviewFlag(invoice.hostProfileId);
    await this.recordMatchFeeEvent(params.invoiceId, 'PAID', {
      detail: 'Paid via Stripe.',
      occurredAt: paidAt,
    });

    const host = invoice.hostProfile;
    if (host?.userId && host.user?.email) {
      try {
        await this.notifications.notifyHostMatchFeePaid({
          recipientId: host.userId,
          recipientEmail: host.user.email,
          jobTitle: invoice.jobPosting.title,
          invoiceId: params.invoiceId,
          amountCents: matchFeeTotalCents(invoice),
          taxCents: invoice.taxCents,
        });
      } catch (err) {
        this.logger.warn(
          `Host payment confirmation failed for invoice ${params.invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const locum = invoice.application?.locumProfile;
    if (locum?.userId && locum.user?.email) {
      try {
        await this.notifications.notifyLocumMatchFeePaid({
          recipientId: locum.userId,
          recipientEmail: locum.user.email,
          firstName: locum.firstName,
          lastName: locum.lastName,
          jobTitle: invoice.jobPosting.title,
          clinicName: host?.practiceName ?? '',
          invoiceId: params.invoiceId,
        });
      } catch (err) {
        this.logger.warn(
          `Locum payment confirmation failed for invoice ${params.invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return true;
  }

  async resolveRefund(invoiceId: string, admin: RefundAdmin, adminNotes?: string) {
    const notes = requireRefundReason(adminNotes);
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
    if (isRefundPendingReview(invoice)) {
      // The cancellation policy already qualified this invoice for a refund.
      await this.processRefund({
        invoiceId,
        kind: 'CANCELLATION',
        admin,
        adminNotes: notes,
        cancelledBy: invoice.cancelledBy ?? 'ADMIN',
        reason: invoice.cancellationReason ?? notes,
      });
      return { success: true };
    }
    if (invoice.status === 'PENDING_REPLACEMENT') {
      // Replacement FOUND is set automatically when another locum accepts.
      // Admin refunds here when no replacement accepted — not a manual "found / not found" decision.
      await this.processRefund({
        invoiceId,
        kind: 'NO_REPLACEMENT',
        admin,
        adminNotes: notes,
        cancelledBy: 'ADMIN',
        reason: `No replacement locum accepted; refund to original payment method. ${notes}`,
      });
      await this.prisma.matchFeeInvoice.update({
        where: { id: invoiceId },
        data: { replacementStatus: 'NOT_FOUND' },
      });
      await this.recordMatchFeeEvent(invoiceId, 'REPLACEMENT_NOT_FOUND', {
        detail: notes,
        actor: 'ADMIN',
      });
      return { success: true };
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
        'Refund is only available after a locum withdraws or the host deletes the posting (and 14 days or more before start).',
      );
    }

    // Early cancel: 14 days or more before start → refund allowed.
    const earliest = computeEarliestShiftDate(
      invoice.jobPosting,
      invoice.application,
    );
    const daysUntilStart = daysUntilCalendarDate(earliest);
    if (
      daysUntilStart == null ||
      daysUntilStart < MATCH_FEE_CANCELLATION_WINDOW_DAYS
    ) {
      if (locumWithdrew && isMatchFeeTestingSkipLocumReplacement()) {
        await this.processRefund({
          invoiceId,
          kind: 'CANCELLATION',
          admin,
          adminNotes: notes,
          cancelledBy: 'ADMIN',
          reason: `TESTING: Admin refund after late locum cancel (replacement skipped). ${notes}`,
        });
        return { success: true };
      }
      if (locumWithdrew) {
        throw new BadRequestException(
          'Locum cancelled fewer than 14 days before start. Use the replacement flow; refund only if no replacement is found.',
        );
      }
      throw new BadRequestException(
        'Host cancelled fewer than 14 days before start - the match fee is non-refundable.',
      );
    }

    await this.processRefund({
      invoiceId,
      kind: 'CANCELLATION',
      admin,
      adminNotes: notes,
      cancelledBy: 'ADMIN',
      reason: locumWithdrew
        ? `Admin refund after locum withdraw - 14 days or more before start. ${notes}`
        : `Admin refund after host deleted posting - 14 days or more before start. ${notes}`,
    });
    return { success: true };
  }

  /**
   * Post-completion discretionary refund (half or full match-fee tier). Host tickets surface
   * the issue; admin chooses the amount. Invoice must be PAID and posting ended.
   */
  async discretionaryRefund(
    invoiceId: string,
    admin: RefundAdmin,
    params: {
      /** Match fee portion before HST; the matching HST is refunded with it. */
      amountCents: number;
      adminNotes?: string;
      ticketId?: string;
    },
  ) {
    const notes = requireRefundReason(params.adminNotes);
    if (
      params.amountCents !== MATCH_FEE_HALF_CENTS &&
      params.amountCents !== MATCH_FEE_FULL_CENTS
    ) {
      throw new BadRequestException(
        `Refund amount must be $${MATCH_FEE_HALF_CENTS / 100} or $${MATCH_FEE_FULL_CENTS / 100}.`,
      );
    }

    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        jobPosting: {
          select: { id: true, status: true, endDate: true, title: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'PAID') {
      throw new BadRequestException(
        'Post-completion refunds apply only to paid invoices.',
      );
    }

    const postingDone =
      invoice.jobPosting.status === 'COMPLETED' ||
      (invoice.jobPosting.endDate != null &&
        platformCalendarDateOf(invoice.jobPosting.endDate) <
          platformCalendarDateToday());
    if (!postingDone) {
      throw new BadRequestException(
        'Wait until the locum shift is completed before issuing a post-completion refund.',
      );
    }

    if (params.ticketId) {
      const ticket = await this.prisma.supportTicket.findFirst({
        where: {
          id: params.ticketId,
          OR: [
            { matchFeeInvoiceId: invoiceId },
            { jobPostingId: invoice.jobPostingId },
          ],
        },
        select: { id: true },
      });
      if (!ticket) {
        throw new BadRequestException('Support ticket not found for this invoice.');
      }
    }

    await this.processRefund({
      invoiceId,
      kind: 'POST_COMPLETION',
      admin,
      feeCents: params.amountCents,
      adminNotes: notes,
      cancelledBy: 'ADMIN',
      reason: notes,
    });

    const refundTotal =
      params.amountCents + computeMatchFeeTaxCents(params.amountCents, invoice.taxRateBps);
    if (params.ticketId) {
      await this.prisma.supportTicket.update({
        where: { id: params.ticketId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          adminNotes: notes,
          matchFeeInvoiceId: invoiceId,
        },
      });
      await this.recordMatchFeeEvent(invoiceId, 'TICKET_RESOLVED', {
        detail: `Ticket resolved with ${formatCad(refundTotal)} refund - Notes: ${notes}`,
        actor: 'ADMIN',
      });
    }

    return { success: true };
  }

  async setReplacementStatus(
    invoiceId: string,
    replacementStatus: MatchFeeReplacementStatus,
    admin: RefundAdmin,
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

    const inFlight = await this.prisma.matchFeeRefund.count({
      where: { invoiceId, ...NON_DUPLICATE_REFUND_IN_FLIGHT },
    });
    if (inFlight > 0) {
      throw new ConflictException(
        'A refund is already in progress for this invoice. Wait for Stripe to finish before changing replacement status.',
      );
    }

    if (replacementStatus === 'FOUND') {
      const full = await this.prisma.matchFeeInvoice.findUnique({
        where: { id: invoiceId },
        select: {
          jobPostingId: true,
          applicationId: true,
          cancelledAt: true,
          adminNotes: true,
        },
      });
      if (!full?.cancelledAt) {
        throw new BadRequestException('Cannot mark replacement found without a cancellation date.');
      }
      const replacementApp = await this.prisma.application.findFirst({
        where: {
          jobPostingId: full.jobPostingId,
          status: 'CONFIRMED',
          locumAcceptedAt: { gt: full.cancelledAt },
          id: { not: full.applicationId },
        },
        orderBy: { locumAcceptedAt: 'desc' },
        select: { id: true },
      });
      if (!replacementApp) {
        throw new BadRequestException(
          'No confirmed replacement locum found on this posting (accept must be after the cancellation). Confirm a locum first or use No replacement to refund.',
        );
      }
      if (adminNotes?.trim()) {
        await this.prisma.matchFeeInvoice.update({
          where: { id: invoiceId },
          data: { adminNotes: adminNotes.trim() },
        });
      }
      await this.markReplacementFound(invoiceId, replacementApp.id);
    } else if (replacementStatus === 'NOT_FOUND') {
      const notes = requireRefundReason(adminNotes);
      await this.processRefund({
        invoiceId,
        kind: 'NO_REPLACEMENT',
        admin,
        reason: `No replacement locum found; refund to original payment method. ${notes}`,
        cancelledBy: 'ADMIN',
        adminNotes: notes,
      });
      await this.prisma.matchFeeInvoice.update({
        where: { id: invoiceId },
        data: { replacementStatus: 'NOT_FOUND' },
      });
      await this.recordMatchFeeEvent(invoiceId, 'REPLACEMENT_NOT_FOUND', {
        detail: notes,
        actor: 'ADMIN',
      });
    }

    await this.syncHostReviewFlag(invoice.jobPosting.hostProfileId);
    return { success: true };
  }

  async writeOffInvoice(invoiceId: string, adminNotes?: string) {
    const notes = requireRefundReason(adminNotes);
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
        cancellationReason: `Admin write-off: ${notes}`,
        adminNotes: notes,
      },
    });
    await this.recordMatchFeeEvent(invoiceId, 'CANCELLED', {
      detail: `Admin write-off: ${notes}`,
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

  async addAdminNote(invoiceId: string, adminNotes: string) {
    const notes = adminNotes.trim();
    if (!notes) {
      throw new BadRequestException('Notes are required.');
    }
    const invoice = await this.prisma.matchFeeInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, adminNotes: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: {
        adminNotes: invoice.adminNotes
          ? `${invoice.adminNotes}\n---\n${notes}`
          : notes,
      },
    });
    await this.recordMatchFeeEvent(invoiceId, 'ADMIN_NOTE', {
      detail: notes,
      actor: 'ADMIN',
    });
    return { success: true };
  }

  async getInvoiceSummaryForApplications(applicationIds: string[]) {
    if (applicationIds.length === 0) return new Map<string, MatchFeeInvoiceDto>();
    const rows = await this.prisma.matchFeeInvoice.findMany({
      where: { applicationId: { in: applicationIds }, kind: 'PRIMARY' },
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
        : null;

    return buildMatchFeeReceiptPdf({
      invoiceId: row.id,
      invoiceNumber: receiptNumber,
      issuedAt: row.createdAt,
      paidAt: row.paidAt,
      dueAt: row.dueAt,
      amountCents: row.amountCents,
      taxCents: row.taxCents,
      taxRateLabel: formatTaxRate(row.taxRateBps),
      refundedCents: row.refundedCents,
      hstRegistrationNumber: process.env.HST_REGISTRATION_NUMBER?.trim() || null,
      currency: row.currency,
      status: row.status,
      jobTitle: mapped.jobTitle,
      postingScheduleLabel: mapped.postingScheduleLabel,
      postingLocation: mapped.postingLocation,
      locumName: mapped.locumName,
      replacedByLocumName: mapped.replacedByLocumName,
      practiceName: hostProfile.practiceName,
      hostEmail: hostProfile.user.email,
      paymentProvider: paymentProviderLabel(row.paymentProvider),
      paymentReference,
    });
  }
}
