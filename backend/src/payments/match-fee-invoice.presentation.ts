import type { MatchFeeInvoiceStatus } from '@prisma/client';
import { MATCH_FEE_DUE_DAYS, MATCH_FEE_POLICY } from './match-fee.constants.js';
import {
  computeEarliestShiftDate,
  daysUntilCalendarDate,
} from './match-fee-cancellation.util.js';
import { formatCalendarDateForApi } from '../host/job-schedule.util.js';

export type MatchFeeStatusAdminGuide = {
  /** Invoice status when applicable; flag keys like ESCALATED for non-status chips. */
  status: MatchFeeInvoiceStatus | 'ESCALATED' | 'HOSTS_UNDER_REVIEW';
  label: string;
  summary: string;
  hostObligation: string;
};

export const MATCH_FEE_STATUS_ADMIN_GUIDE: MatchFeeStatusAdminGuide[] = [
  {
    status: 'PENDING',
    label: 'Pending payment',
    summary: 'Match confirmed; host has not paid yet and due date has not passed.',
    hostObligation: 'Pay the invoiced match fee ($125 or $250) by the policy due date (see due date on each row).',
  },
  {
    status: 'OVERDUE',
    label: 'Overdue',
    summary: 'Due date passed without payment. The invoice status is Overdue from day 1 past due.',
    hostObligation: 'Pay immediately or contact support.',
  },
  {
    status: 'ESCALATED',
    label: 'Escalated',
    summary:
      'Not a separate invoice status. An Overdue invoice that has stayed unpaid for 30+ days past its due date gets an escalated flag (invoice remains Overdue). Admin should follow up; the host account may also be marked under review.',
    hostObligation: 'Pay the overdue fee immediately. LocumLink will follow up until resolved.',
  },
  {
    status: 'PAID',
    label: 'Paid',
    summary: 'Platform match fee collected (mock or Stripe).',
    hostObligation:
      'None while the match stands. Refund to your payment method only if you cancel the posting or match more than 14 days before start (see policy).',
  },
  {
    status: 'PENDING_REPLACEMENT',
    label: 'Replacement pending',
    summary: 'Locum cancelled within 14 days of start after fee was paid; LocumLink seeks a replacement.',
    hostObligation: 'Await replacement locum accept or admin refund if none.',
  },
  {
    status: 'REFUNDED',
    label: 'Refunded',
    summary: 'Fee returned to the original payment method per policy or admin action.',
    hostObligation: 'None.',
  },
  {
    status: 'CANCELLED',
    label: 'Cancelled',
    summary:
      'Invoice voided: no payment was collected (e.g. posting removed or match ended while the fee was still unpaid).',
    hostObligation: 'None.',
  },
  {
    status: 'HOSTS_UNDER_REVIEW',
    label: 'Hosts under review',
    summary:
      'Not an invoice status — a count of host accounts flagged for admin attention (usually after an invoice escalates from long overdue). Clear the flag from the invoice row once the host has paid or the issue is handled.',
    hostObligation: 'Host should clear outstanding match fees; admin clears the review flag when done.',
  },
];

export type MatchFeeInvoiceTimeline = {
  invoiceCreatedAt: string;
  earliestShiftDate: string | null;
  dueAt: string;
  duePolicyText: string;
  paidAt: string | null;
  primaryDateLabel: string;
  secondaryDateLabel: string | null;
  daysUntilDue: number | null;
  daysOverdue: number | null;
  canSendReminder: boolean;
};

type PostingForDates = {
  startDate: Date | string | null;
  endDate: Date | string | null;
  shifts?: { date: Date | string }[];
};

type ApplicationForDates = {
  availabilityKind?: string | null;
  availableDates?: string[] | null;
};

export function buildMatchFeeDuePolicyText(): string {
  return MATCH_FEE_POLICY.dueRule;
}

export function buildMatchFeeInvoiceTimeline(params: {
  status: MatchFeeInvoiceStatus;
  createdAt: Date;
  dueAt: Date;
  paidAt: Date | null;
  jobPosting: PostingForDates;
  application: ApplicationForDates;
  now?: Date;
}): MatchFeeInvoiceTimeline {
  const now = params.now ?? new Date();
  const earliestShiftDate = computeEarliestShiftDate(
    params.jobPosting,
    params.application,
  );
  const duePolicyText = `${MATCH_FEE_DUE_DAYS} days after invoice or before shift start (${earliestShiftDate ?? 'shift date TBD'}), whichever is first.`;

  const dueAtMs = params.dueAt.getTime();
  const nowDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dueDay = Date.UTC(
    params.dueAt.getUTCFullYear(),
    params.dueAt.getUTCMonth(),
    params.dueAt.getUTCDate(),
  );
  const dayDiff = Math.floor((dueDay - nowDay) / (24 * 60 * 60 * 1000));

  let primaryDateLabel: string;
  let secondaryDateLabel: string | null = null;
  let daysUntilDue: number | null = null;
  let daysOverdue: number | null = null;

  const dueFormatted = params.dueAt.toLocaleDateString('en-CA', {
    timeZone: 'UTC',
  });

  if (params.paidAt) {
    primaryDateLabel = `Paid ${params.paidAt.toLocaleDateString('en-CA', { timeZone: 'UTC' })}`;
    secondaryDateLabel = `Was due by ${dueFormatted}`;
  } else if (params.status === 'CANCELLED' || params.status === 'REFUNDED' || params.status === 'CREDITED') {
    primaryDateLabel = `Was due by ${dueFormatted}`;
    secondaryDateLabel = 'No longer collectible';
  } else if (dayDiff < 0) {
    daysOverdue = Math.abs(dayDiff);
    primaryDateLabel = `Overdue since ${dueFormatted} (${daysOverdue} day${daysOverdue === 1 ? '' : 's'})`;
    secondaryDateLabel = earliestShiftDate
      ? `Shift starts ${earliestShiftDate}`
      : null;
  } else if (dayDiff === 0) {
    daysUntilDue = 0;
    primaryDateLabel = `Due today (${dueFormatted})`;
  } else {
    daysUntilDue = dayDiff;
    primaryDateLabel = `Due by ${dueFormatted} (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'})`;
    if (earliestShiftDate) {
      secondaryDateLabel = `Shift starts ${earliestShiftDate}`;
    }
  }

  const canSendReminder =
    params.status === 'PENDING' || params.status === 'OVERDUE';

  return {
    invoiceCreatedAt: params.createdAt.toISOString(),
    earliestShiftDate,
    dueAt: params.dueAt.toISOString(),
    duePolicyText,
    paidAt: params.paidAt?.toISOString() ?? null,
    primaryDateLabel,
    secondaryDateLabel,
    daysUntilDue,
    daysOverdue,
    canSendReminder,
  };
}

export function formatShiftDateForDisplay(
  startDate: Date | string | null | undefined,
): string | null {
  return formatCalendarDateForApi(startDate);
}

export function buildDaysUntilStartLabel(
  jobPosting: PostingForDates,
  application: ApplicationForDates,
): number | null {
  const earliest = computeEarliestShiftDate(jobPosting, application);
  return daysUntilCalendarDate(earliest);
}
