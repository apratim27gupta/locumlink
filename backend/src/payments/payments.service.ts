import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  MatchFeeCancelledBy,
  MatchFeeInvoiceStatus,
  MatchFeeRefundResolution,
  MatchFeeReplacementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import {
  MATCH_FEE_AMOUNT_CENTS,
  MATCH_FEE_CURRENCY,
  MATCH_FEE_POLICY,
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
import { StripeService } from './stripe.service.js';
import type Stripe from 'stripe';
import { getPostingRequiredDates } from '../host/job-schedule.util.js';
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
      locumProfile: {
        select: {
          firstName: true,
          lastName: true,
          userId: true,
        },
      },
    },
  },
  jobPosting: {
    select: {
      id: true,
      title: true,
      location: true,
      startDate: true,
      endDate: true,
      shifts: { select: { date: true } },
    },
  },
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
};

function formatLocumName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Locum';
}

function mapInvoice(row: Prisma.MatchFeeInvoiceGetPayload<{
  include: typeof invoiceInclude;
}>): MatchFeeInvoiceDto {
  const earliest = computeEarliestShiftDate(row.jobPosting, row.application);
  return {
    id: row.id,
    applicationId: row.applicationId,
    jobPostingId: row.jobPostingId,
    amountCents: row.amountCents,
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
          ? 'LocumLink is free for locums. The host pays the $250 match fee after you accept a confirmed placement.'
          : 'Free to post. Free to review applicants. Pay $250 only when a locum accepts your confirmed match.',
    };
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
        jobPosting: {
          select: {
            id: true,
            title: true,
            hostProfileId: true,
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
      },
    });
    if (!app?.locumAcceptedAt) return;

    const existingForPosting = await this.prisma.matchFeeInvoice.findFirst({
      where: {
        jobPostingId: app.jobPostingId,
        status: { in: ['PENDING', 'OVERDUE', 'PAID', 'PENDING_REPLACEMENT'] },
      },
      select: { id: true, status: true },
    });
    if (existingForPosting) {
      if (existingForPosting.status === 'PENDING_REPLACEMENT') {
        await this.completeReplacementAcceptance(applicationId);
      }
      return;
    }

    const createdAt = new Date();
    const earliestShiftDate = computeEarliestShiftDate(app.jobPosting, app);
    const dueAt = computeDueAt(createdAt, earliestShiftDate);

    const invoice = await this.prisma.matchFeeInvoice.create({
      data: {
        applicationId,
        hostProfileId: app.jobPosting.hostProfileId,
        jobPostingId: app.jobPostingId,
        amountCents: MATCH_FEE_AMOUNT_CENTS,
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
  }

  /**
   * Per-post match fee: when a replacement locum accepts (any partial/full availability),
   * the existing invoice stays paid and replacement is marked found.
   */
  async registerReplacementLocumAccepted(applicationId: string): Promise<void> {
    await this.completeReplacementAcceptance(applicationId);
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
      orderBy: { createdAt: 'desc' },
    });
    if (!replacementInvoice) return;

    await this.prisma.$transaction(async (tx) => {
      const duplicateForApp = await tx.matchFeeInvoice.findUnique({
        where: { applicationId: app.id },
        select: { id: true, status: true },
      });
      if (
        duplicateForApp &&
        duplicateForApp.id !== replacementInvoice.id &&
        ['PENDING', 'OVERDUE'].includes(duplicateForApp.status)
      ) {
        await tx.matchFeeInvoice.update({
          where: { id: duplicateForApp.id },
          data: {
            status: 'CANCELLED',
            cancellationReason:
              'Superseded by per-post match fee when replacement locum accepted.',
          },
        });
      }

      await tx.matchFeeInvoice.updateMany({
        where: {
          jobPostingId: app.jobPostingId,
          id: { not: replacementInvoice.id },
          status: { in: ['PENDING', 'OVERDUE'] },
        },
        data: {
          status: 'CANCELLED',
          cancellationReason:
            'Superseded by per-post match fee when replacement locum accepted.',
        },
      });

      await tx.matchFeeInvoice.update({
        where: { id: replacementInvoice.id },
        data: {
          status: 'PAID',
          replacementStatus: 'FOUND',
          refundResolution: 'NONE',
          applicationId: app.id,
        },
      });
    });
  }

  /** Fix invoices left in PENDING_REPLACEMENT after a locum already re-confirmed on the posting. */
  private async syncStuckReplacementInvoices(hostProfileId: string): Promise<void> {
    const stuck = await this.prisma.matchFeeInvoice.findMany({
      where: { hostProfileId, status: 'PENDING_REPLACEMENT' },
      select: {
        jobPostingId: true,
        application: { select: { id: true, status: true, locumAcceptedAt: true } },
      },
    });
    for (const inv of stuck) {
      if (
        inv.application.status === 'CONFIRMED' &&
        inv.application.locumAcceptedAt
      ) {
        await this.completeReplacementAcceptance(inv.application.id);
        continue;
      }
      const replacementApp = await this.prisma.application.findFirst({
        where: {
          jobPostingId: inv.jobPostingId,
          status: 'CONFIRMED',
          locumAcceptedAt: { not: null },
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
      include: invoiceInclude,
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
      include: invoiceInclude,
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

    const host = app.jobPosting.hostProfile;
    if (host?.userId && host.user?.email) {
      await this.notifications.notifyHostMatchFeeCancelled({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: app.jobPosting.title,
        reason: policy.reason,
        invoiceId: invoice.id,
      });
    }

    if (
      nextStatus === 'REFUNDED' ||
      nextStatus === 'CREDITED' ||
      nextStatus === 'CANCELLED'
    ) {
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
        ...invoiceInclude,
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

  async adminMatchFeeSummary() {
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
    return {
      byStatus,
      escalated,
      reviewHosts,
      stripeEnabled: this.stripeService.isEnabled(),
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
      include: invoiceInclude,
    });

    await this.syncHostReviewFlag(invoice.hostProfileId);

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

  async resolveRefund(
    invoiceId: string,
    resolution: 'REFUND' | 'CREDIT',
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

    const status = resolution === 'CREDIT' ? 'CREDITED' : 'REFUNDED';
    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: {
        status,
        refundResolution: resolution,
        adminNotes: adminNotes ?? invoice.adminNotes,
      },
    });

    const host = invoice.hostProfile;
    if (host?.userId && host.user?.email) {
      await this.notifications.notifyHostMatchFeeRefund({
        recipientId: host.userId,
        recipientEmail: host.user.email,
        jobTitle: invoice.jobPosting.title,
        resolution,
        invoiceId,
      });
    }
    await this.syncHostReviewFlag(invoice.jobPosting.hostProfileId);
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

    let nextStatus: MatchFeeInvoiceStatus = 'PENDING_REPLACEMENT';
    let refundResolution: MatchFeeRefundResolution = 'PENDING';
    if (replacementStatus === 'FOUND') {
      nextStatus = 'PAID';
      refundResolution = 'NONE';
    } else if (replacementStatus === 'NOT_FOUND') {
      nextStatus = 'REFUNDED';
      refundResolution = 'REFUND';
    }

    await this.prisma.matchFeeInvoice.update({
      where: { id: invoiceId },
      data: {
        replacementStatus,
        status: nextStatus,
        refundResolution,
        adminNotes: adminNotes ?? invoice.adminNotes,
      },
    });

    if (replacementStatus === 'NOT_FOUND') {
      const host = invoice.hostProfile;
      if (host?.userId && host.user?.email) {
        await this.notifications.notifyHostMatchFeeRefund({
          recipientId: host.userId,
          recipientEmail: host.user.email,
          jobTitle: invoice.jobPosting.title,
          resolution: 'REFUND',
          invoiceId,
        });
      }
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
      include: invoiceInclude,
    });
    return new Map(rows.map((row) => [row.applicationId, mapInvoice(row)]));
  }
}
