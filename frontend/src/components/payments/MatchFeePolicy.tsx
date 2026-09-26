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
  paymentMethods?: { enabled: boolean; mockEnabled: boolean };
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

const HOST_REFUND_MIN_DAYS_BEFORE_START = 15; // policy: more than 14 days before start

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
 * and only when more than 14 days before start.
 * Late locum cancel → use "No replacement". Host late cancel → non-refundable.
 */
export function adminMatchFeeRefundEligibility(invoice: {
  status: string;
  daysUntilStart: number | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  events?: Array<{ eventType: string }> | null;
}): { allowed: boolean; reason: string } {
  if (invoice.status === 'PENDING_REPLACEMENT') {
    return {
      allowed: false,
      reason:
        'Locum cancelled within 14 days of start. Per policy, try to find a replacement first. Use "No replacement" to refund the host if none is found.',
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
        'Refund is only available after a locum withdraws or the host deletes the posting (and more than 14 days before start).',
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
          'Locum cancelled within 14 days of start. Use the replacement search flow; refund only if no replacement is found.',
      };
    }
    return {
      allowed: false,
      reason:
        'Host cancelled within 14 days of start - the match fee is non-refundable.',
    };
  }

  return {
    allowed: true,
    reason: locumWithdrew
      ? 'Locum withdrew more than 14 days before start - a paid match fee may be refunded.'
      : 'Host deleted the posting more than 14 days before start - a paid match fee may be refunded.',
  };
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
    default:
      return status;
  }
}

export function matchFeeStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'PAID':
      return { bg: '#D1FAE5', text: '#065F46' };
    case 'OVERDUE':
      return { bg: '#FEE2E2', text: '#991B1B' };
    case 'PENDING':
      return { bg: '#FEF3C7', text: '#92400E' };
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
