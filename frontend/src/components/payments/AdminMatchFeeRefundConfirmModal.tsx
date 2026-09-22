'use client';

import type { CSSProperties } from 'react';
import type { AdminMatchFeeInvoice } from '@/lib/adminApi';
import { adminMatchFeeRefundEligibility } from '@/components/payments/MatchFeePolicy';

type AdminMatchFeeRefundConfirmModalProps = {
  invoice: AdminMatchFeeInvoice | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const cancelBtn: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  background: '#fff',
  color: '#374151',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export function AdminMatchFeeRefundConfirmModal({
  invoice,
  open,
  busy,
  onClose,
  onConfirm,
}: AdminMatchFeeRefundConfirmModalProps) {
  if (!open || !invoice) return null;

  const eligibility = adminMatchFeeRefundEligibility(invoice);
  const amount = `$${(invoice.amountCents / 100).toFixed(0)} ${invoice.currency}`;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-match-fee-refund-title"
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 480,
          width: '100%',
          padding: '22px 22px 18px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="admin-match-fee-refund-title"
          style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: '#111827' }}
        >
          Confirm refund?
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151', lineHeight: 1.55 }}>
          Refund <strong>{amount}</strong> for <strong>{invoice.jobTitle}</strong> (
          {invoice.hostPracticeName}) to the original payment method.
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
          Locum: {invoice.locumName}
          {invoice.daysUntilStart != null
            ? ` · ${invoice.daysUntilStart} day${invoice.daysUntilStart === 1 ? '' : 's'} until start`
            : ' · start date unknown'}
        </p>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 13,
            color: eligibility.allowed ? '#065F46' : '#991B1B',
            lineHeight: 1.5,
            background: eligibility.allowed ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${eligibility.allowed ? '#A7F3D0' : '#FECACA'}`,
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          {eligibility.reason}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{ ...cancelBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !eligibility.allowed}
            onClick={onConfirm}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: busy || !eligibility.allowed ? '#94A3B8' : '#B91C1C',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: busy || !eligibility.allowed ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Refunding…' : 'Confirm refund'}
          </button>
        </div>
      </div>
    </div>
  );
}
