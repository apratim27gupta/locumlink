import type { MatchFeeInvoiceStatus } from '@prisma/client';
import { MATCH_FEE_DUE_DAYS, MATCH_FEE_POLICY } from './match-fee.constants.js';
import {
  computeEarliestShiftDate,
  daysUntilCalendarDate,
} from './match-fee-cancellation.util.js';
import { formatCalendarDateForApi } from '../host/job-schedule.util.js';

export type MatchFeeStatusAdminGuide = {
  status: MatchFeeInvoiceStatus;
  label: string;
  summary: string;
  hostObligation: string;
};

export const MATCH_FEE_STATUS_ADMIN_GUIDE: MatchFeeStatusAdminGuide[] = [
  {
    status: 'PENDING',
    label: 'Pending payment',
    summary: 'Match confirmed; host has not paid yet and due date has not passed.',
    hostObligation: 'Pay $250 by the policy due date (see due date on each row).',
  },
  {
    status: 'OVERDUE',
    label: 'Overdue',
    summary: 'Due date passed without payment. Account may be flagged after 30 days overdue.',
    hostObligation: 'Pay immediately or contact support.',
  },
  {
    status: 'PAID',
    label: 'Paid',
    summary: 'Platform match fee collected (mock or Stripe).',
    hostObligation: 'None unless a eligible cancellation triggers refund review.',
  },
  {
    status: 'PENDING_REPLACEMENT',
    label: 'Replacement pending',
    summary: 'Locum cancelled within 14 days of start after fee was paid; LocumLink seeks a replacement.',
    hostObligation: 'Await replacement locum accept or admin outcome (refund/credit if none).',
  },
  {
    status: 'REFUNDED',
    label: 'Refunded',
    summary: 'Fee returned per cancellation policy or admin action.',
    hostObligation: 'None.',
  },
  {
    status: 'CREDITED',
    label: 'Credit issued',
    summary: 'Fee credited to host per policy or admin discretion.',
    hostObligation: 'None.',
  },
  {
    status: 'CANCELLED',
    label: 'Cancelled',
    summary: 'No fee owed (e.g. cancelled before payment or early cancel while unpaid).',
    hostObligation: 'None.',
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
