'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
  adminDiscretionaryMatchFeeRefund,
  adminListSupportTickets,
  adminResolveSupportTicket,
  type AdminMatchFeeInvoice,
  type AdminSupportTicket,
} from '@/lib/adminApi';
import { MatchFeeEventTimeline } from '@/components/payments/MatchFeeEventTimeline';
import { AdminMatchFeeRefundConfirmModal } from '@/components/payments/AdminMatchFeeRefundConfirmModal';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type RefundConfirmState = {
  ticket: AdminSupportTicket;
  amountCents: 12500 | 25000;
};

export default function AdminTicketsPage() {
  const [items, setItems] = useState<AdminSupportTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundConfirm, setRefundConfirm] = useState<RefundConfirmState | null>(null);
  const [resolvePrompt, setResolvePrompt] = useState<{
    ticketId: string;
    status: 'RESOLVED' | 'DISMISSED';
  } | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListSupportTickets(statusFilter || undefined);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tickets.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmResolve() {
    if (!resolvePrompt) return;
    setBusyId(resolvePrompt.ticketId);
    setError('');
    try {
      await adminResolveSupportTicket(resolvePrompt.ticketId, {
        status: resolvePrompt.status,
        adminNotes: resolveNotes.trim() || undefined,
      });
      setResolvePrompt(null);
      setResolveNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update ticket.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRefund(params: { notes: string; amountCents?: number }) {
    if (!refundConfirm?.ticket.invoice) return;
    const { ticket, amountCents } = refundConfirm;
    setBusyId(ticket.id);
    setError('');
    try {
      await adminDiscretionaryMatchFeeRefund(ticket.invoice!.id, {
        amountCents: (params.amountCents ?? amountCents) as 12500 | 25000,
        ticketId: ticket.id,
        adminNotes: params.notes || undefined,
      });
      setRefundConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed.');
    } finally {
      setBusyId(null);
    }
  }

  const refundInvoiceForModal: AdminMatchFeeInvoice | null = refundConfirm?.ticket.invoice
    ? ({
        id: refundConfirm.ticket.invoice.id,
        hostProfileId: refundConfirm.ticket.hostProfileId,
        hostUserId: null,
        hostEmail: refundConfirm.ticket.hostEmail,
        applicationId: '',
        jobPostingId: refundConfirm.ticket.jobPostingId,
        amountCents: refundConfirm.ticket.invoice.amountCents,
        currency: refundConfirm.ticket.invoice.currency,
        status: refundConfirm.ticket.invoice.status,
        dueAt: '',
        paidAt: null,
        mockPaymentRef: null,
        paymentProvider: null,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        lastReminderAt: null,
        escalatedAt: null,
        createdAt: '',
        jobTitle: refundConfirm.ticket.jobTitle,
        locumName: refundConfirm.ticket.invoice.locumName ?? '—',
        replacedByLocumName: refundConfirm.ticket.invoice.replacedByLocumName ?? null,
        hostPracticeName: refundConfirm.ticket.hostPracticeName,
        matchFeeReviewRequired: false,
        adminNotes: null,
        daysUntilStart: null,
        postingCompleted: true,
        refundedCents: refundConfirm.ticket.invoice.refundedCents,
        statusGuide: null,
        timeline: {
          primaryDateLabel: '',
          secondaryDateLabel: null,
          duePolicyText: '',
          invoiceCreatedAt: '',
          canSendReminder: false,
          daysUntilDue: null,
          daysOverdue: null,
          earliestShiftDate: null,
          dueAt: '',
          paidAt: null,
        },
        events: [],
      } as AdminMatchFeeInvoice)
    : null;

  return (
    <AdminLayout>
      <div style={{ maxWidth: 900, padding: '8px 0 48px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Host tickets</h1>
        <p style={{ margin: '0 0 16px', color: '#6B7280', fontSize: 14, lineHeight: 1.5 }}>
          Tickets are always linked to a match fee invoice. Review the invoice history, add notes,
          and confirm refunds by typing Refund.
        </p>

        <div style={{ marginBottom: 16 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB' }}
          >
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
            <option value="">All</option>
          </select>
        </div>

        {error ? <div style={{ color: '#B91C1C', marginBottom: 12 }}>{error}</div> : null}
        {loading ? <div style={{ color: '#6B7280' }}>Loading…</div> : null}
        {!loading && items.length === 0 ? (
          <div style={{ color: '#6B7280' }}>No tickets.</div>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((ticket) => {
            const busy = busyId === ticket.id;
            const remaining = ticket.invoice?.remainingRefundableCents ?? 0;
            const can125 = remaining >= 12500 && ticket.invoice?.status === 'PAID';
            const can250 = remaining >= 25000 && ticket.invoice?.status === 'PAID';
            const timelineEvents = (ticket.invoice?.events ?? []).map((e) => ({
              id: e.id,
              eventType: e.eventType,
              label: e.eventType.replace(/_/g, ' '),
              detail: e.detail,
              actor: e.actor,
              occurredAt: e.occurredAt,
            }));
            return (
              <div
                key={ticket.id}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  padding: 16,
                  background: '#fff',
                }}
              >
                <div style={{ fontWeight: 700 }}>{ticket.jobTitle}</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                  {[
                    ticket.hostPracticeName?.trim(),
                    ticket.hostEmail,
                    fmtDate(ticket.createdAt),
                    ticket.status,
                    ticket.matchFeeInvoiceId
                      ? `invoice …${ticket.matchFeeInvoiceId.slice(-6)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {ticket.invoice?.locumName ? (
                  <div style={{ fontSize: 13, color: '#111827', marginTop: 6, fontWeight: 600 }}>
                    Locum: {ticket.invoice.locumName}
                    {ticket.invoice.replacedByLocumName
                      ? ` · ${ticket.invoice.replacedByLocumName} replaced ${ticket.invoice.locumName}`
                      : ''}
                  </div>
                ) : null}
                <p
                  style={{
                    margin: '10px 0 0',
                    fontSize: 14,
                    color: '#111827',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {ticket.message}
                </p>
                {ticket.invoice ? (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>
                    Invoice ${(ticket.invoice.amountCents / 100).toFixed(0)} ·{' '}
                    {ticket.invoice.status}
                    {ticket.invoice.refundedCents > 0
                      ? ` · already refunded $${(ticket.invoice.refundedCents / 100).toFixed(0)}`
                      : ''}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#B91C1C' }}>
                    Missing invoice link — should not happen for new tickets.
                  </div>
                )}

                {timelineEvents.length > 0 ? (
                  <MatchFeeEventTimeline events={timelineEvents} />
                ) : null}

                {ticket.status === 'OPEN' ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                    {can125 ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => setRefundConfirm({ ticket, amountCents: 12500 })}
                      >
                        Refund $125
                      </button>
                    ) : null}
                    {can250 ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => setRefundConfirm({ ticket, amountCents: 25000 })}
                      >
                        Refund $250
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={busy}
                      onClick={() => {
                        setResolveNotes('');
                        setResolvePrompt({ ticketId: ticket.id, status: 'RESOLVED' });
                      }}
                    >
                      Mark resolved
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        setResolveNotes('');
                        setResolvePrompt({ ticketId: ticket.id, status: 'DISMISSED' });
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <AdminMatchFeeRefundConfirmModal
        invoice={refundInvoiceForModal}
        open={refundConfirm != null}
        busy={busyId === refundConfirm?.ticket.id}
        mode="discretionary"
        amountCents={refundConfirm?.amountCents}
        onClose={() => {
          if (busyId !== refundConfirm?.ticket.id) setRefundConfirm(null);
        }}
        onConfirm={(params) => void confirmRefund(params)}
      />

      {resolvePrompt ? (
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
            if (busyId !== resolvePrompt.ticketId && e.target === e.currentTarget) {
              setResolvePrompt(null);
            }
          }}
        >
          <div
            role="dialog"
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              width: '100%',
              maxWidth: 420,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
              {resolvePrompt.status === 'DISMISSED' ? 'Dismiss ticket?' : 'Resolve ticket?'}
            </h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>
              Optional notes are saved on the linked invoice history.
            </p>
            <textarea
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Notes (optional)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busyId === resolvePrompt.ticketId}
                onClick={() => setResolvePrompt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-success"
                disabled={busyId === resolvePrompt.ticketId}
                onClick={() => void confirmResolve()}
              >
                {busyId === resolvePrompt.ticketId ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
