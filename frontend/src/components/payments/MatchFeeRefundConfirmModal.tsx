'use client';

import type { CSSProperties } from 'react';
import type { MatchFeeInvoice } from '@/lib/api';

const outlineBtn: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  background: '#fff',
  color: '#0F2A7A',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  display: 'inline-block',
};

export function matchFeeOutlineButtonStyle(disabled?: boolean): CSSProperties {
  return {
    ...outlineBtn,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'default' : 'pointer',
  };
}

type MatchFeeRefundConfirmModalProps = {
  invoice: MatchFeeInvoice | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function MatchFeeRefundConfirmModal({
  invoice,
  open,
  busy,
  onClose,
  onConfirm,
}: MatchFeeRefundConfirmModalProps) {
  if (!open || !invoice) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-fee-refund-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 440,
          width: '100%',
          padding: '22px 22px 18px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="match-fee-refund-title"
          style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: '#111827' }}
        >
          Request refund?
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151', lineHeight: 1.55 }}>
          Your match fee for <strong>{invoice.jobTitle}</strong> will be refunded to your original
          payment method. This cancels the confirmed match for this posting.
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
          This option is available because your shift starts more than 14 days from now, per our
          cancellation policy.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={matchFeeOutlineButtonStyle(busy)}
          >
            Keep match
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: busy ? '#94A3B8' : '#B91C1C',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Processing…' : 'Cancel match & refund'}
          </button>
        </div>
      </div>
    </div>
  );
}
