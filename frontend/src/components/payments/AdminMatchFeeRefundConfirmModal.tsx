'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { AdminMatchFeeInvoice } from '@/lib/adminApi';
import { adminMatchFeeRefundEligibility } from '@/components/payments/MatchFeePolicy';

export const REFUND_CONFIRM_WORD = 'Refund';

type RefundConfirmMode = 'policy' | 'discretionary' | 'no_replacement';

type AdminMatchFeeRefundConfirmModalProps = {
  invoice: AdminMatchFeeInvoice | null;
  open: boolean;
  busy: boolean;
  mode: RefundConfirmMode;
  /** Required for discretionary mode ($125 or $250). */
  amountCents?: number;
  onClose: () => void;
  onConfirm: (params: { notes: string; amountCents?: number }) => void;
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

const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  fontFamily: 'inherit',
  fontSize: 14,
};

export function AdminMatchFeeRefundConfirmModal({
  invoice,
  open,
  busy,
  mode,
  amountCents,
  onClose,
  onConfirm,
}: AdminMatchFeeRefundConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setTyped('');
      setNotes('');
    }
  }, [open, invoice?.id, mode, amountCents]);

  if (!open || !invoice) return null;

  const eligibility =
    mode === 'policy' ? adminMatchFeeRefundEligibility(invoice) : { allowed: true, reason: '' };

  const refundCents =
    mode === 'discretionary'
      ? (amountCents ?? invoice.amountCents)
      : invoice.amountCents;
  const amountLabel = `$${(refundCents / 100).toFixed(0)} ${invoice.currency}`;
  const typedOk = typed.trim() === REFUND_CONFIRM_WORD;
  const canSubmit =
    !busy &&
    typedOk &&
    (mode !== 'policy' || eligibility.allowed) &&
    (mode !== 'discretionary' || (amountCents === 12500 || amountCents === 25000));

  const title =
    mode === 'no_replacement'
      ? 'Confirm no replacement — refund host?'
      : mode === 'discretionary'
        ? `Confirm refund of ${amountLabel}?`
        : 'Confirm refund?';

  const body =
    mode === 'no_replacement' ? (
      <>
        Locum cancelled within 14 days of start for <strong>{invoice.jobTitle}</strong>. If no
        replacement is found, refund <strong>{amountLabel}</strong> to{' '}
        <strong>{invoice.hostPracticeName}</strong>.
      </>
    ) : (
      <>
        Refund <strong>{amountLabel}</strong> for <strong>{invoice.jobTitle}</strong> (
        {invoice.hostPracticeName}) to the original payment method.
      </>
    );

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
          {title}
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151', lineHeight: 1.55 }}>
          {body}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
          Locum: {invoice.locumName}
          {invoice.daysUntilStart != null
            ? ` · ${invoice.daysUntilStart} day${invoice.daysUntilStart === 1 ? '' : 's'} until start`
            : ''}
        </p>

        {mode === 'policy' ? (
          <p
            style={{
              margin: '0 0 14px',
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
        ) : null}

        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 6,
          }}
        >
          Notes (optional, saved on invoice history)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={busy}
          placeholder="Why is this refund being issued?"
          style={{ ...fieldStyle, resize: 'vertical', marginBottom: 14 }}
        />

        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 6,
          }}
        >
          Type <span style={{ fontFamily: 'ui-monospace, monospace' }}>{REFUND_CONFIRM_WORD}</span>{' '}
          to confirm
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder={REFUND_CONFIRM_WORD}
          style={{ ...fieldStyle, marginBottom: 18 }}
        />

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
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                notes: notes.trim(),
                amountCents: mode === 'discretionary' ? amountCents : undefined,
              })
            }
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: !canSubmit ? '#94A3B8' : '#B91C1C',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: !canSubmit ? 'default' : 'pointer',
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
