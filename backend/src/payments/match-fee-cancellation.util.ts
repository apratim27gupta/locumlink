import {
  MATCH_FEE_CANCELLATION_WINDOW_DAYS,
  MATCH_FEE_DUE_DAYS,
  MATCH_FEE_ESCALATION_DAYS_AFTER_DUE,
} from './match-fee.constants.js';
import {
  applicationClaimedDates,
  formatCalendarDateForApi,
  getPostingRequiredDates,
} from '../host/job-schedule.util.js';

export type CancellationActor = 'HOST' | 'LOCUM' | 'ADMIN' | 'SYSTEM';

export type CancellationPolicyResult = {
  daysUntilStart: number | null;
  withinLateWindow: boolean;
  invoiceStatus:
    | 'CANCELLED'
    | 'PENDING_REPLACEMENT'
    | 'REFUNDED'
    | 'CREDITED'
    | 'UNCHANGED';
  refundResolution: 'NONE' | 'REFUND' | 'CREDIT' | 'PENDING';
  replacementStatus: 'NONE' | 'SEARCHING' | 'FOUND' | 'NOT_FOUND';
  nonRefundable: boolean;
  reason: string;
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

export function computeEarliestShiftDate(
  posting: PostingForDates,
  application: ApplicationForDates,
): string | null {
  const required = getPostingRequiredDates(posting);
  const claimed = applicationClaimedDates(application, required);
  const sorted = [...claimed].sort();
  return sorted[0] ?? formatCalendarDateForApi(posting.startDate);
}

export function daysUntilCalendarDate(
  targetDate: string | null,
  now = new Date(),
): number | null {
  if (!targetDate) return null;
  const [y, m, d] = targetDate.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.floor((target - today) / (24 * 60 * 60 * 1000));
}

export function computeDueAt(
  invoiceCreatedAt: Date,
  earliestShiftDate: string | null,
): Date {
  const sevenDaysLater = new Date(invoiceCreatedAt);
  sevenDaysLater.setUTCDate(sevenDaysLater.getUTCDate() + MATCH_FEE_DUE_DAYS);

  if (!earliestShiftDate) return sevenDaysLater;

  const [y, m, d] = earliestShiftDate.split('-').map(Number);
  const shiftStart = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return sevenDaysLater.getTime() <= shiftStart.getTime()
    ? sevenDaysLater
    : shiftStart;
}

export function isEscalationDue(
  dueAt: Date,
  escalatedAt: Date | null,
  now = new Date(),
): boolean {
  if (escalatedAt) return false;
  const threshold = new Date(dueAt);
  threshold.setUTCDate(
    threshold.getUTCDate() + MATCH_FEE_ESCALATION_DAYS_AFTER_DUE,
  );
  return now.getTime() >= threshold.getTime();
}

export function evaluateCancellationPolicy(params: {
  cancelledBy: CancellationActor;
  wasPaid: boolean;
  daysUntilStart: number | null;
  reason?: string;
}): CancellationPolicyResult {
  const { cancelledBy, wasPaid, daysUntilStart } = params;
  const withinLateWindow =
    daysUntilStart != null &&
    daysUntilStart <= MATCH_FEE_CANCELLATION_WINDOW_DAYS;

  if (cancelledBy === 'HOST') {
    if (withinLateWindow) {
      return {
        daysUntilStart,
        withinLateWindow: true,
        invoiceStatus: wasPaid ? 'UNCHANGED' : 'CANCELLED',
        refundResolution: 'NONE',
        replacementStatus: 'NONE',
        nonRefundable: wasPaid,
        reason:
          'Host cancelled within 14 days of start. The match fee is non-refundable.',
      };
    }
    return {
      daysUntilStart,
      withinLateWindow: false,
      invoiceStatus: wasPaid ? 'REFUNDED' : 'CANCELLED',
      refundResolution: wasPaid ? 'REFUND' : 'NONE',
      replacementStatus: 'NONE',
      nonRefundable: false,
      reason:
        'Host cancelled more than 14 days before start. Refund to original payment method if the fee was paid.',
    };
  }

  if (cancelledBy === 'LOCUM') {
    if (withinLateWindow) {
      return {
        daysUntilStart,
        withinLateWindow: true,
        invoiceStatus: wasPaid ? 'PENDING_REPLACEMENT' : 'CANCELLED',
        refundResolution: wasPaid ? 'PENDING' : 'NONE',
        replacementStatus: wasPaid ? 'SEARCHING' : 'NONE',
        nonRefundable: wasPaid,
        reason:
          'Locum cancelled within 14 days of start. LocumLink will seek a replacement before issuing a refund.',
      };
    }
    return {
      daysUntilStart,
      withinLateWindow: false,
      invoiceStatus: wasPaid ? 'REFUNDED' : 'CANCELLED',
      refundResolution: wasPaid ? 'REFUND' : 'NONE',
      replacementStatus: 'NONE',
      nonRefundable: false,
      reason:
        'Locum cancelled more than 14 days before start. Refund to original payment method if the fee was paid.',
    };
  }

  return {
    daysUntilStart,
    withinLateWindow,
    invoiceStatus: wasPaid ? 'REFUNDED' : 'CANCELLED',
    refundResolution: wasPaid ? 'REFUND' : 'NONE',
    replacementStatus: 'NONE',
    nonRefundable: false,
    reason: params.reason ?? 'Cancelled by admin.',
  };
}
