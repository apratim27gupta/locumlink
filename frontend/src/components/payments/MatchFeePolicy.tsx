'use client';

import type { CSSProperties } from 'react';

export type MatchFeePolicyContent = {
  role: 'HOST' | 'LOCUM';
  emphasis: string;
  locumFee: string;
  hostPostingFee: string;
  matchFeeAmountCad: number;
  matchFeeDescription: string;
  dueRule: string;
  clinicalPayNote: string;
  futurePaymentMethods: string;
  cancellationRules: Array<{ id: string; summary: string }>;
  paymentMethods?: { enabled: boolean; mockEnabled: boolean };
};

type MatchFeePolicyBodyProps = {
  policy: MatchFeePolicyContent;
  listStyle?: CSSProperties;
};

export function MatchFeePolicyBody({ policy, listStyle }: MatchFeePolicyBodyProps) {
  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
        {policy.emphasis}
      </p>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
        Match fee
      </div>
      <ul
        style={{
          margin: '0 0 16px',
          paddingLeft: 20,
          fontSize: 14,
          color: '#4B5563',
          lineHeight: 1.55,
          ...listStyle,
        }}
      >
        <li>{policy.matchFeeDescription}</li>
        <li>{policy.dueRule}</li>
        <li>{policy.clinicalPayNote}</li>
        {policy.role === 'HOST' ? <li>{policy.futurePaymentMethods}</li> : null}
        {policy.role === 'LOCUM' ? (
          <li>LocumLink is free for locums. You are never charged the platform match fee.</li>
        ) : null}
      </ul>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
        Cancellation
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 20,
          fontSize: 14,
          color: '#4B5563',
          lineHeight: 1.55,
          ...listStyle,
        }}
      >
        {policy.cancellationRules.map((rule) => (
          <li key={rule.id}>{rule.summary}</li>
        ))}
      </ul>
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
      return 'Credit issued';
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
