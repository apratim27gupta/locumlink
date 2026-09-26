'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DashLayout from '@/components/DashLayout';
import {
  MatchFeePolicyModal,
  matchFeeStatusColor,
  matchFeeStatusLabel,
} from '@/components/payments/MatchFeePolicy';
import { MatchFeeEventTimeline } from '@/components/payments/MatchFeeEventTimeline';
import { matchFeeOutlineButtonStyle } from '@/components/payments/MatchFeeRefundConfirmModal';
import type { MatchFeePolicyContent } from '@/components/payments/MatchFeePolicy';
import { HOST_DASH_NAV } from '@/lib/hostNav';
import { notifyMatchFeesUpdated } from '@/lib/matchFeeUpdatedEvent';
import { hostApi, type MatchFeeInvoice } from '@/lib/api';
import type { HostProfile } from '@/types';

export default function HostInvoicesPage() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [policy, setPolicy] = useState<MatchFeePolicyContent | null>(null);
  const [invoices, setInvoices] = useState<MatchFeeInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [ticketFor, setTicketFor] = useState<MatchFeeInvoice | null>(null);
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketBusy, setTicketBusy] = useState(false);

  const stripeEnabled = policy?.paymentMethods?.enabled === true;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, pol, list] = await Promise.all([
        hostApi.getProfile(),
        hostApi.getMatchFeePolicy(),
        hostApi.listMatchFees(),
      ]);
      setProfile(p);
      setPolicy(pol);
      setInvoices(list.items);
      notifyMatchFeesUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load match fees.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get('paid') === '1') {
      setBanner('Payment submitted. Your invoice will update once payment is confirmed.');
    } else if (searchParams.get('cancelled') === '1') {
      setBanner('Checkout cancelled. You can pay anytime before the due date.');
    }
  }, [searchParams]);

  async function payInvoice(invoice: MatchFeeInvoice) {
    setPayingId(invoice.id);
    setError(null);
    try {
      if (stripeEnabled) {
        const { url } = await hostApi.payMatchFeeStripe(invoice.id);
        window.location.href = url;
        return;
      }
      await hostApi.payMatchFeeMock(invoice.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.');
      setPayingId(null);
    }
  }

  async function submitTicket() {
    if (!ticketFor || !ticketMessage.trim() || ticketBusy) return;
    setTicketBusy(true);
    setError(null);
    try {
      await hostApi.createSupportTicket({
        jobPostingId: ticketFor.jobPostingId,
        matchFeeInvoiceId: ticketFor.id,
        message: ticketMessage.trim(),
      });
      setBanner('Ticket submitted. LocumLink will follow up on your invoice concerns.');
      setTicketFor(null);
      setTicketMessage('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit ticket.');
    } finally {
      setTicketBusy(false);
    }
  }

  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;

  return (
    <DashLayout
      navItems={HOST_DASH_NAV}
      activeHref="/host/invoices"
      topbarFirstName={profile?.contactFirstName}
      topbarLastName={profile?.contactLastName}
    >
      <div style={{ maxWidth: 640, padding: '24px 16px 48px 0' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
          Match Fees
        </h1>
        <button
          type="button"
          onClick={() => setPolicyOpen(true)}
          style={{
            margin: '0 0 20px',
            padding: 0,
            border: 'none',
            background: 'none',
            color: '#2563EB',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          Match fee &amp; cancellation policy
        </button>

        {banner ? (
          <div
            style={{
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              color: '#065F46',
              fontSize: 13,
            }}
          >
            {banner}
          </div>
        ) : null}

        {overdueCount > 0 ? (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              color: '#991B1B',
              fontSize: 13,
            }}
          >
            You have {overdueCount} overdue match fee{overdueCount === 1 ? '' : 's'}. Please pay
            promptly to avoid admin review.
          </div>
        ) : null}

        {error ? (
          <div style={{ color: '#B91C1C', fontSize: 13, marginBottom: 12 }}>{error}</div>
        ) : null}

        {loading ? (
          <div style={{ color: '#6B7280', fontSize: 14 }}>Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div
            style={{
              border: '1px dashed #D1D5DB',
              borderRadius: 12,
              padding: 24,
              textAlign: 'left',
              color: '#6B7280',
              fontSize: 14,
            }}
          >
            No match fees yet. An invoice is created when a locum accepts your confirmed placement.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {invoices.map((invoice) => {
              const colors = matchFeeStatusColor(invoice.status);
              const canPay = invoice.status === 'PENDING' || invoice.status === 'OVERDUE';
              const busy = payingId === invoice.id;
              const postingHref = `/host/applicants/${encodeURIComponent(invoice.jobPostingId)}`;
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
                  <div style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: '#0F2A7A',
                        fontSize: 16,
                      }}
                    >
                      {invoice.jobTitle}
                    </div>
                    <div style={{ fontSize: 14, color: '#111827', marginTop: 6, fontWeight: 600 }}>
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
                    {invoice.postingScheduleLabel ? (
                      <div style={{ fontSize: 13, color: '#374151', marginTop: 6 }}>
                        Shifts: {invoice.postingScheduleLabel}
                      </div>
                    ) : null}
                    {invoice.postingLocation ? (
                      <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                        {invoice.postingLocation}
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
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
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>
                      ${(invoice.amountCents / 100).toFixed(0)} {invoice.currency}
                    </span>
                    <span style={{ fontSize: 13, color: '#6B7280' }}>
                      Due {new Date(invoice.dueAt).toLocaleDateString('en-CA')}
                      {invoice.paidAt
                        ? ` · Paid ${new Date(invoice.paidAt).toLocaleDateString('en-CA')}`
                        : ''}
                    </span>
                  </div>

                  {invoice.events?.length ? (
                    <MatchFeeEventTimeline events={invoice.events} compact />
                  ) : null}

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Link href={postingHref} style={matchFeeOutlineButtonStyle(busy)}>
                      View job
                    </Link>
                    {invoice.postingCompleted && !invoice.supportTicket ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setTicketFor(invoice);
                          setTicketMessage('');
                        }}
                        style={matchFeeOutlineButtonStyle(busy)}
                      >
                        Raise a ticket
                      </button>
                    ) : null}
                    {invoice.supportTicket ? (
                      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>
                        Ticket{' '}
                        {invoice.supportTicket.status === 'OPEN'
                          ? 'submitted'
                          : invoice.supportTicket.status === 'RESOLVED'
                            ? 'resolved'
                            : 'closed'}
                      </span>
                    ) : null}
                    {canPay ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void payInvoice(invoice)}
                        style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          border: 'none',
                          background: busy ? '#94A3B8' : '#0F2A7A',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: busy ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {busy && payingId === invoice.id
                          ? stripeEnabled
                            ? 'Redirecting…'
                            : 'Processing…'
                          : 'Pay'}
                      </button>
                    ) : null}
                  {invoice.paidAt ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void hostApi.downloadMatchFeeReceipt(invoice.id)}
                      style={matchFeeOutlineButtonStyle(busy)}
                    >
                      Download receipt (PDF)
                    </button>
                  ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ticketFor ? (
        <div
          role="dialog"
          aria-modal="true"
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
            if (!ticketBusy && e.target === e.currentTarget) {
              setTicketFor(null);
            }
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              width: '100%',
              maxWidth: 440,
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Raise a ticket</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
              For invoice on {ticketFor.jobTitle}. Share any concerns after the last shift on this
              invoice - LocumLink will follow up. Fees are not adjusted mid-placement.
            </p>
            <textarea
              value={ticketMessage}
              onChange={(e) => setTicketMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="What happened?"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #D1D5DB',
                fontFamily: 'inherit',
                fontSize: 14,
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                disabled={ticketBusy}
                onClick={() => setTicketFor(null)}
                style={matchFeeOutlineButtonStyle(ticketBusy)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={ticketBusy || !ticketMessage.trim()}
                onClick={() => void submitTicket()}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    ticketBusy || !ticketMessage.trim() ? '#94A3B8' : '#0F2A7A',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: ticketBusy || !ticketMessage.trim() ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {ticketBusy ? 'Submitting…' : 'Submit ticket'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MatchFeePolicyModal
        policy={policy}
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
      />
    </DashLayout>
  );
}
