'use client';

import type { CSSProperties } from 'react';

export type MatchFeePolicyContent = {
  role: 'HOST' | 'LOCUM';
  emphasis: string;
  locumFee: string;
  hostPostingFee: string;
  matchFeeAmountCad: number;
  matchFeeHalfCad?: number;
  matchFeeFullCad?: number;
  /** Preferred: short bullets under Match fee. */
  matchFeePoints?: string[];
  matchFeeDescription: string;
  perPostFeeRule?: string;
  perLocumFeeRule?: string;
  dueRule: string;
  clinicalPayNote: string;
  cancellationRules: Array<{ id: string; summary: string }>;
  paymentMethods?: { enabled: boolean };
};

type MatchFeePolicyBodyProps = {
  policy: MatchFeePolicyContent;
  listStyle?: CSSProperties;
};

const bulletListStyle = (extra?: CSSProperties): CSSProperties => ({
  margin: '0 0 16px',
  paddingLeft: 22,
  fontSize: 14,
  color: '#4B5563',
  lineHeight: 1.55,
  listStyleType: 'disc',
  listStylePosition: 'outside',
  ...extra,
});

export function MatchFeePolicyBody({ policy, listStyle }: MatchFeePolicyBodyProps) {
  const matchFeeItems =
    policy.matchFeePoints && policy.matchFeePoints.length > 0
      ? policy.matchFeePoints
      : [policy.matchFeeDescription];

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
        {policy.emphasis}
      </p>

      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        Match fee
      </div>
      <ul style={bulletListStyle(listStyle)}>
        {matchFeeItems.map((item) => (
          <li key={item} style={{ marginBottom: 6 }}>
            {item}
          </li>
        ))}
        {policy.role === 'HOST' && (policy.perLocumFeeRule || policy.perPostFeeRule) ? (
          <li style={{ marginBottom: 6 }}>
            {policy.perLocumFeeRule ?? policy.perPostFeeRule}
          </li>
        ) : null}
        <li style={{ marginBottom: 6 }}>{policy.dueRule}</li>
        <li style={{ marginBottom: 6 }}>{policy.clinicalPayNote}</li>
        {policy.role === 'LOCUM' ? (
          <li style={{ marginBottom: 6 }}>
            LocumLink is free for locums. You are never charged the platform match fee.
          </li>
        ) : null}
      </ul>

      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        Cancellation &amp; after completion
      </div>
      <ol
        style={{
          ...bulletListStyle({ margin: 0, ...listStyle }),
          listStyleType: 'decimal',
        }}
      >
        {policy.cancellationRules.map((rule) => (
          <li key={rule.id} style={{ marginBottom: 8 }}>
            {rule.summary}
          </li>
        ))}
      </ol>
    </>
  );
}

type MatchFeePolicyModalProps = {
  policy: MatchFeePolicyContent | null;
  open: boolean;
  onClose: () => void;
};

export function MatchFeePolicyModal({ policy, open, onClose }: MatchFeePolicyModalProps) {
  if (!open || !policy) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-fee-policy-title"
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '24px 28px',
          maxWidth: 520,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="match-fee-policy-title"
          style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: '#0B0F1F' }}
        >
          Match fee &amp; cancellation policy
        </h2>
        <MatchFeePolicyBody policy={policy} />
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 20,
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #D0D5DD',
            background: '#fff',
            color: '#374151',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/** Inline block (host invoices link target uses modal instead). */
export default function MatchFeePolicy({
  policy,
  compact = false,
}: {
  policy: MatchFeePolicyContent | null;
  compact?: boolean;
}) {
  if (!policy) return null;

  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: compact ? 14 : 18,
        background: '#F9FAFB',
        marginTop: compact ? 12 : 0,
        marginBottom: compact ? 0 : 16,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        LocumLink match fee policy
      </div>
      <MatchFeePolicyBody policy={policy} listStyle={{ fontSize: 13 }} />
    </div>
  );
}

const HOST_REFUND_MIN_DAYS_BEFORE_START = 14; // policy: 14 days or more before start

/** Always two decimals with `$` only: "$10.00", "$11.40". Do not append CAD. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function hstFor(feeCents: number, taxRateBps: number): number {
  return Math.round((feeCents * taxRateBps) / 10_000);
}

export function formatTaxRate(taxRateBps: number): string {
  return `${taxRateBps / 100}%`;
}

/** Host may cancel match and receive a fee refund (paid invoice, outside late window). */
export function hostMatchFeeRefundEligible(invoice: {
  paidAt: string | null;
  status: string;
  daysUntilStart: number | null;
}): boolean {
  if (!invoice.paidAt) return false;
  if (invoice.status !== 'PAID') return false;
  if (invoice.daysUntilStart == null) return false;
  return invoice.daysUntilStart >= HOST_REFUND_MIN_DAYS_BEFORE_START;
}

/**
 * Admin "Refund to payment method" is only for early-cancel leftovers after:
 * - locum withdraws, or
 * - host deletes the posting
 * and only when 14 days or more before start.
 * Late locum cancel → refund when no replacement locum accepts. Host late cancel → non-refundable.
 */
export function adminMatchFeeRefundInFlight(invoice: {
  refunds?: Array<{ status: string; kind: string }> | null;
}): boolean {
  return (
    invoice.refunds?.some(
      (r) =>
        r.kind !== 'DUPLICATE_PAYMENT' &&
        (r.status === 'REQUESTED' || r.status === 'PENDING'),
    ) ?? false
  );
}

export function adminMatchFeeRefundEligibility(invoice: {
  status: string;
  daysUntilStart: number | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  refundPendingReview?: boolean;
  events?: Array<{ eventType: string }> | null;
}): { allowed: boolean; reason: string } {
  if (invoice.refundPendingReview) {
    return {
      allowed: true,
      reason:
        'The cancellation qualifies for a refund under the policy. Review and approve it to refund the fee and HST.',
    };
  }
  if (invoice.status === 'PENDING_REPLACEMENT') {
    return {
      allowed: true,
      reason:
        'Locum cancelled fewer than 14 days before start. A replacement is confirmed only when another locum accepts. Refund if none has accepted.',
    };
  }
  if (invoice.status !== 'PAID') {
    return {
      allowed: false,
      reason: 'Refund applies only to a paid invoice after an eligible cancellation.',
    };
  }

  const postingRemoved = (invoice.events ?? []).some(
    (e) => e.eventType === 'POSTING_REMOVED',
  );
  const reason = (invoice.cancellationReason ?? '').toLowerCase();
  const hostDeletedPost =
    postingRemoved ||
    (invoice.cancelledBy === 'HOST' &&
      (reason.includes('job posting removed') ||
        reason.includes('posting removed') ||
        reason.includes('removed the job')));
  const locumWithdrew = invoice.cancelledBy === 'LOCUM';

  if (!locumWithdrew && !hostDeletedPost) {
    return {
      allowed: false,
      reason:
        'Refund is only available after a locum withdraws or the host deletes the posting (and 14 days or more before start).',
    };
  }

  if (
    invoice.daysUntilStart == null ||
    invoice.daysUntilStart < HOST_REFUND_MIN_DAYS_BEFORE_START
  ) {
    if (locumWithdrew) {
      return {
        allowed: false,
        reason:
          'Locum cancelled fewer than 14 days before start. Wait for a replacement accept, or refund if none accepts.',
      };
    }
    return {
      allowed: false,
      reason:
        'Host cancelled fewer than 14 days before start - the match fee is non-refundable.',
    };
  }

  return {
    allowed: true,
    reason: locumWithdrew
      ? 'Locum withdrew 14 days or more before start - a paid match fee may be refunded.'
      : 'Host deleted the posting 14 days or more before start - a paid match fee may be refunded.',
  };
}

export function matchFeeRefundInProgress(invoice: {
  refundPendingReview?: boolean;
  stripeRefundProcessing?: boolean;
}): boolean {
  return Boolean(invoice.refundPendingReview || invoice.stripeRefundProcessing);
}

export function matchFeeVisualStatus(
  status: string,
  refundPendingReview?: boolean,
  opts?: { stripeRefundProcessing?: boolean; feeRetained?: boolean },
): string {
  if (matchFeeRefundInProgress({
    refundPendingReview,
    stripeRefundProcessing: opts?.stripeRefundProcessing,
  })) {
    return 'REFUND_IN_PROGRESS';
  }
  if (opts?.feeRetained && status === 'PAID') return 'FEE_RETAINED';
  return status;
}

/** Why a paid invoice is waiting on an admin refund, if it is. */
export function matchFeeRefundDueReason(invoice: {
  refundPendingReview?: boolean;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
}): string | null {
  if (!invoice.refundPendingReview) return null;
  const reason = invoice.cancellationReason?.trim();
  if (reason) return reason;
  if (invoice.cancelledBy === 'LOCUM') {
    return 'The locum withdrew 14 days or more before start, so the paid match fee should be refunded.';
  }
  if (invoice.cancelledBy === 'HOST') {
    return 'The host cancelled 14 days or more before start, so the paid match fee should be refunded.';
  }
  return 'This cancellation qualifies for a refund under the match fee policy.';
}

export function matchFeeStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Due';
    case 'OVERDUE':
      return 'Overdue';
    case 'PAID':
      return 'Paid';
    case 'CANCELLED':
      return 'Cancelled';
    case 'REFUNDED':
      return 'Refunded';
    case 'CREDITED':
      return 'Legacy credit';
    case 'PENDING_REPLACEMENT':
      return 'Replacement pending';
    case 'REFUND_IN_PROGRESS':
      return 'Refund in progress';
    case 'FEE_RETAINED':
      return 'Fee retained';
    default:
      return status;
  }
}

function matchFeeStatusMood(status: string): 'happy' | 'neutral' | 'sad' {
  if (status === 'PAID' || status === 'REFUNDED' || status === 'CREDITED') return 'happy';
  if (status === 'FEE_RETAINED') return 'neutral';
  if (status === 'OVERDUE') return 'sad';
  return 'neutral';
}

const MOUTH_PATH = {
  happy: 'M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2',
  neutral: 'M8.5 15h7',
  sad: 'M8 16.5c1-1.3 2.4-2 4-2s3 .7 4 2',
} as const;

export function MatchFeeStatusChip({
  status,
  refundPendingReview,
  stripeRefundProcessing,
  feeRetained,
}: {
  status: string;
  refundPendingReview?: boolean;
  stripeRefundProcessing?: boolean;
  feeRetained?: boolean;
}) {
  const visual = matchFeeVisualStatus(status, refundPendingReview, {
    stripeRefundProcessing,
    feeRetained,
  });
  const colors = matchFeeStatusColor(visual);
  const mood = matchFeeStatusMood(visual);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px 4px 7px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        whiteSpace: 'nowrap',
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9.5" />
        <circle cx="9" cy="10" r="0.6" fill="currentColor" />
        <circle cx="15" cy="10" r="0.6" fill="currentColor" />
        <path d={MOUTH_PATH[mood]} />
      </svg>
      {matchFeeStatusLabel(visual)}
    </span>
  );
}

export function matchFeeStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'PAID':
      return { bg: '#D1FAE5', text: '#065F46' };
    case 'OVERDUE':
      return { bg: '#FEE2E2', text: '#991B1B' };
    case 'PENDING':
      return { bg: '#FEF3C7', text: '#92400E' };
    case 'REFUND_IN_PROGRESS':
      return { bg: '#FFEDD5', text: '#9A3412' };
    case 'FEE_RETAINED':
      return { bg: '#F3F4F6', text: '#4B5563' };
    case 'PENDING_REPLACEMENT':
      return { bg: '#E0E7FF', text: '#3730A3' };
    case 'REFUNDED':
    case 'CREDITED':
    case 'CANCELLED':
      return { bg: '#F3F4F6', text: '#374151' };
    default:
      return { bg: '#F3F4F6', text: '#374151' };
  }
}
