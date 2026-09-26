'use client';
import { showPrompt } from '@/components/ui/AppDialog';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
  adminAddMatchFeeNote,
  adminClearMatchFeeReview,
  adminDiscretionaryMatchFeeRefund,
  adminListMatchFees,
  adminMatchFeeSummary,
  adminResolveMatchFeeRefund,
  adminSendMatchFeeReminder,
  adminSetMatchFeeReplacementStatus,
  type AdminMatchFeeInvoice,
  type AdminMatchFeeStatusGuide,
  type AdminMatchFeeSummary,
} from '@/lib/adminApi';
import {
  matchFeeStatusColor,
  matchFeeStatusLabel,
  adminMatchFeeRefundEligibility,
} from '@/components/payments/MatchFeePolicy';
import { MatchFeeEventTimeline } from '@/components/payments/MatchFeeEventTimeline';
import { AdminMatchFeeRefundConfirmModal } from '@/components/payments/AdminMatchFeeRefundConfirmModal';

type RefundConfirmState = {
  invoice: AdminMatchFeeInvoice;
  mode: 'policy' | 'discretionary' | 'no_replacement';
  amountCents?: number;
};

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<AdminMatchFeeInvoice[]>([]);
  const [statusGuide, setStatusGuide] = useState<AdminMatchFeeStatusGuide[]>([]);
  const [summary, setSummary] = useState<AdminMatchFeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [reminderMenuId, setReminderMenuId] = useState<string | null>(null);
  const [refundConfirm, setRefundConfirm] = useState<RefundConfirmState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, sum] = await Promise.all([
        adminListMatchFees({
          status: statusFilter || undefined,
          escalatedOnly,
        }),
        adminMatchFeeSummary(),
      ]);
      setItems(res.items);
      setStatusGuide(res.statusGuide ?? []);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load match fees.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, escalatedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(invoiceId: string, action: () => Promise<unknown>) {
    setBusyId(invoiceId);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function sendReminder(
    invoice: AdminMatchFeeInvoice,
    options: { sendEmail: boolean; sendNotification: boolean },
  ) {
    setReminderMenuId(null);
    await runAction(invoice.id, () => adminSendMatchFeeReminder(invoice.id, options));
  }

  async function confirmRefund(params: { notes: string; amountCents?: number }) {
    if (!refundConfirm) return;
    const { invoice, mode } = refundConfirm;
    setBusyId(invoice.id);
    setError(null);
    try {
      if (mode === 'policy') {
        await adminResolveMatchFeeRefund(invoice.id, params.notes || undefined);
      } else if (mode === 'no_replacement') {
        await adminSetMatchFeeReplacementStatus(
          invoice.id,
          'NOT_FOUND',
          params.notes || undefined,
        );
      } else {
        const amount = (params.amountCents ?? refundConfirm.amountCents) as
          | 12500
          | 25000;
        await adminDiscretionaryMatchFeeRefund(invoice.id, {
          amountCents: amount,
          adminNotes: params.notes || undefined,
        });
      }
      setRefundConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function addNote(invoice: AdminMatchFeeInvoice) {
    const notes = await showPrompt({
      title: 'Add note',
      message: 'Add a note to this invoice history.',
      placeholder: 'Note',
      confirmLabel: 'Add note',
      multiline: true,
    });
    if (notes == null) return;
    const trimmed = notes.trim();
    if (!trimmed) return;
    await runAction(invoice.id, () => adminAddMatchFeeNote(invoice.id, trimmed));
  }

  const cardStyle: CSSProperties = {
    border: '1px solid #E5E7EB',
    borderRadius: 10,
    padding: '12px 14px',
    background: '#fff',
    minWidth: 100,
  };

  return (
    <AdminLayout>
      <div style={{ padding: '8px 0 32px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700 }}>Match Fees</h1>
        <p style={{ margin: '0 0 16px', color: '#6B7280', fontSize: 14 }}>
          Policy due dates, payment timeline, reminders, and collection status.
          {!summary?.stripeEnabled ? ' Mock pay only until Stripe is configured on the API.' : null}
        </p>

        {summary ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {(
              [
                ['PENDING', 'Pending'],
                ['OVERDUE', 'Overdue'],
                ['PAID', 'Paid'],
                ['REFUNDED', 'Refunded'],
                ['PENDING_REPLACEMENT', 'Replacement pending'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} style={cardStyle}>
                <div style={{ fontSize: 12, color: '#6B7280' }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.byStatus[key] ?? 0}</div>
              </div>
            ))}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: '#6B7280' }}>Escalated</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: summary.escalated ? '#B45309' : undefined }}>
                {summary.escalated}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: '#6B7280' }}>Hosts under review</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.reviewHosts}</div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          style={{
            marginBottom: 16,
            fontSize: 13,
            color: '#2563EB',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {guideOpen ? 'Hide status guide' : 'Show status guide'}
        </button>

        {guideOpen && statusGuide.length > 0 ? (
          <div
            style={{
              marginBottom: 20,
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: 16,
              background: '#F9FAFB',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>What each status means</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {statusGuide.map((g) => (
                <div key={g.status}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{g.label}</div>
                  <div style={{ fontSize: 13, color: '#4B5563', marginTop: 2 }}>{g.summary}</div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    Host: {g.hostObligation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB' }}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="OVERDUE">Overdue</option>
            <option value="PAID">Paid</option>
            <option value="PENDING_REPLACEMENT">Replacement pending</option>
            <option value="REFUNDED">Refunded</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={escalatedOnly}
              onChange={(e) => setEscalatedOnly(e.target.checked)}
            />
            Escalated only
          </label>
        </div>

        {error ? <div style={{ color: '#B91C1C', marginBottom: 12 }}>{error}</div> : null}
        {loading ? <div>Loading…</div> : null}

        {!loading && items.length === 0 ? (
          <div style={{ color: '#6B7280' }}>No invoices found.</div>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((invoice) => {
            const colors = matchFeeStatusColor(invoice.status);
            const disabled = busyId === invoice.id;
            const guide = invoice.statusGuide;
            const tl = invoice.timeline;
            return (
              <div
                key={invoice.id}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  padding: 16,
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 700 }}>{invoice.jobTitle}</div>
                    <div style={{ fontSize: 13, color: '#6B7280' }}>
                      {invoice.hostPracticeName}
                      {invoice.hostEmail ? ` · ${invoice.hostEmail}` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: '#111827', marginTop: 6, fontWeight: 600 }}>
                      Locum: {invoice.locumName}
                    </div>
                    {invoice.replacedByLocumName ? (
                      <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>
                        {invoice.replacedByLocumName} replaced {invoice.locumName}
                      </div>
                    ) : invoice.replacementStatus === 'SEARCHING' ||
                      invoice.status === 'PENDING_REPLACEMENT' ? (
                      <div style={{ fontSize: 13, color: '#B45309', marginTop: 4 }}>
                        Seeking replacement for {invoice.locumName}
                      </div>
                    ) : null}
                    {guide ? (
                      <div style={{ fontSize: 13, color: '#374151', marginTop: 8, lineHeight: 1.45 }}>
                        <strong>{guide.label}.</strong> {guide.summary}
                      </div>
                    ) : null}
                    {tl ? (
                      <div
                        style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          background: '#F3F4F6',
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#111827' }}>{tl.primaryDateLabel}</div>
                        {tl.secondaryDateLabel ? (
                          <div style={{ color: '#6B7280', marginTop: 2 }}>{tl.secondaryDateLabel}</div>
                        ) : null}
                        <div style={{ color: '#6B7280', marginTop: 6, fontSize: 12 }}>
                          Policy: {tl.duePolicyText}
                        </div>
                        <div style={{ color: '#6B7280', marginTop: 4, fontSize: 12 }}>
                          Invoiced {new Date(tl.invoiceCreatedAt).toLocaleDateString('en-CA')}
                          {invoice.lastReminderAt
                            ? ` · Last reminder ${new Date(invoice.lastReminderAt).toLocaleString('en-CA')}`
                            : ''}
                        </div>
                      </div>
                    ) : null}
                    {invoice.events?.length ? (
                      <MatchFeeEventTimeline events={invoice.events} />
                    ) : null}
                    {invoice.paymentProvider === 'STRIPE' && invoice.paidAt ? (
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
                        Paid via Stripe
                        {invoice.stripePaymentIntentId
                          ? ` · ${invoice.stripePaymentIntentId.slice(0, 20)}…`
                          : ''}
                      </div>
                    ) : null}
                    {invoice.mockPaymentRef ? (
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                        Mock ref: {invoice.mockPaymentRef}
                      </div>
                    ) : null}
                    {invoice.matchFeeReviewRequired ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#B45309', fontWeight: 600 }}>
                        Host flagged for review
                      </div>
                    ) : null}
                    {invoice.escalatedAt ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#B91C1C' }}>
                        Escalated {new Date(invoice.escalatedAt).toLocaleDateString('en-CA')}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>${(invoice.amountCents / 100).toFixed(0)}</div>
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: colors.bg,
                        color: colors.text,
                      }}
                    >
                      {matchFeeStatusLabel(invoice.status)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: '1px solid #E5E7EB',
                    alignItems: 'center',
                  }}
                >
                  {tl?.canSendReminder ? (
                    <RemindHostMenu
                      open={reminderMenuId === invoice.id}
                      disabled={disabled}
                      onToggle={() =>
                        setReminderMenuId((id) => (id === invoice.id ? null : invoice.id))
                      }
                      onClose={() => setReminderMenuId(null)}
                      onSend={(options) => void sendReminder(invoice, options)}
                    />
                  ) : null}
                  {invoice.status === 'PENDING_REPLACEMENT' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-success"
                        disabled={disabled}
                        onClick={() =>
                          void runAction(invoice.id, () =>
                            adminSetMatchFeeReplacementStatus(invoice.id, 'FOUND'),
                          )
                        }
                      >
                        Replacement found
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={disabled}
                        onClick={() =>
                          setRefundConfirm({
                            invoice,
                            mode: 'no_replacement',
                          })
                        }
                      >
                        No replacement
                      </button>
                    </>
                  ) : null}
                  {invoice.status === 'PAID' ? (
                    (() => {
                      const eligibility = adminMatchFeeRefundEligibility(invoice);
                      const remaining =
                        invoice.amountCents - (invoice.refundedCents ?? 0);
                      const postCompletion =
                        invoice.postingCompleted === true && remaining > 0;
                      return (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={disabled || !eligibility.allowed}
                            title={eligibility.reason}
                            onClick={() => {
                              if (!eligibility.allowed) return;
                              setRefundConfirm({ invoice, mode: 'policy' });
                            }}
                          >
                            Refund to payment method
                          </button>
                          {postCompletion ? (
                            <>
                              {remaining >= 12500 ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={disabled}
                                  title="Post-completion refund ($125) — requires confirmation"
                                  onClick={() =>
                                    setRefundConfirm({
                                      invoice,
                                      mode: 'discretionary',
                                      amountCents: 12500,
                                    })
                                  }
                                >
                                  Refund $125
                                </button>
                              ) : null}
                              {remaining >= 25000 ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={disabled}
                                  title="Post-completion refund ($250) — requires confirmation"
                                  onClick={() =>
                                    setRefundConfirm({
                                      invoice,
                                      mode: 'discretionary',
                                      amountCents: 25000,
                                    })
                                  }
                                >
                                  Refund $250
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      );
                    })()
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={disabled}
                    onClick={() => void addNote(invoice)}
                  >
                    Add note
                  </button>
                  {invoice.matchFeeReviewRequired ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={disabled}
                      onClick={() =>
                        void runAction(invoice.id, () =>
                          adminClearMatchFeeReview(invoice.hostProfileId),
                        )
                      }
                    >
                      Clear review flag
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AdminMatchFeeRefundConfirmModal
        invoice={refundConfirm?.invoice ?? null}
        open={refundConfirm != null}
        busy={busyId === refundConfirm?.invoice.id}
        mode={refundConfirm?.mode ?? 'policy'}
        amountCents={refundConfirm?.amountCents}
        onClose={() => {
          if (busyId !== refundConfirm?.invoice.id) setRefundConfirm(null);
        }}
        onConfirm={(params) => void confirmRefund(params)}
      />
    </AdminLayout>
  );
}

function RemindHostMenu({
  open,
  disabled,
  onToggle,
  onClose,
  onSend,
}: {
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSend: (options: { sendEmail: boolean; sendNotification: boolean }) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendNotification, setSendNotification] = useState(true);

  useEffect(() => {
    if (open) {
      setSendEmail(true);
      setSendNotification(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const canSend = sendEmail || sendNotification;

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-primary"
        disabled={disabled}
        aria-expanded={open}
        onClick={onToggle}
      >
        Remind ▾
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 20,
            minWidth: 180,
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            padding: '12px 14px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Email
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
              />
              In-app notification
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSend || disabled}
            style={{ width: '100%' }}
            onClick={() => onSend({ sendEmail, sendNotification })}
          >
            Send
          </button>
        </div>
      ) : null}
    </div>
  );
}
