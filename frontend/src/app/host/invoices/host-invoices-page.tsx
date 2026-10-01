'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DashLayout from '@/components/DashLayout';
import {
  formatCents,
  formatTaxRate,
  MatchFeePolicyModal,
  MatchFeeStatusChip,
} from '@/components/payments/MatchFeePolicy';
import { MatchFeeEventTimeline } from '@/components/payments/MatchFeeEventTimeline';
import { matchFeeOutlineButtonStyle } from '@/components/payments/MatchFeeRefundConfirmModal';
import type { MatchFeePolicyContent } from '@/components/payments/MatchFeePolicy';
import { HOST_DASH_NAV } from '@/lib/hostNav';
import { notifyMatchFeesUpdated } from '@/lib/matchFeeUpdatedEvent';
import { fetchAllPaginated, hostApi, type MatchFeeInvoice } from '@/lib/api';
import type { HostProfile } from '@/types';

export default function HostInvoicesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [policy, setPolicy] = useState<MatchFeePolicyContent | null>(null);
  const [invoices, setInvoices] = useState<MatchFeeInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<{
    tone: 'success' | 'info';
    title: string;
    message: string;
  } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [ticketFor, setTicketFor] = useState<MatchFeeInvoice | null>(null);
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketBusy, setTicketBusy] = useState(false);

  const stripeEnabled = policy?.paymentMethods?.enabled === true;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, pol, items] = await Promise.all([
        hostApi.getProfile(),
        hostApi.getMatchFeePolicy(),
        fetchAllPaginated((cursor) => hostApi.listMatchFees({ limit: 50, cursor })),
      ]);
      setProfile(p);
      setPolicy(pol);
      setInvoices(items);
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

  const focusInvoiceId = searchParams.get('invoiceId');

  useEffect(() => {
    const paid = searchParams.get('paid') === '1';
    const cancelled = searchParams.get('cancelled') === '1';
    if (!paid && !cancelled) return;
    setPaymentNotice(
      paid
        ? {
            tone: 'success',
            title: 'Payment submitted',
            message:
              'Thank you. We are confirming your payment with Stripe. The invoice will show as Paid in a moment.',
          }
        : {
            tone: 'info',
            title: 'Checkout cancelled',
            message: 'No payment was taken. You can pay this invoice anytime from this page.',
          },
    );
    router.replace(
      focusInvoiceId
        ? `/host/invoices?invoiceId=${encodeURIComponent(focusInvoiceId)}`
        : '/host/invoices',
      { scroll: false },
    );
    if (!paid || !focusInvoiceId) return;

    let cancelledSync = false;
    let timer: number | undefined;
    const confirmPayment = async (triesLeft: number) => {
      try {
        const invoice = await hostApi.syncMatchFeePayment(focusInvoiceId);
        if (cancelledSync) return;
        if (invoice.status === 'PAID') {
          setPaymentNotice({
            tone: 'success',
            title: 'Payment received',
            message: `Your ${formatCents(invoice.totalCents)} ${invoice.currency} match fee for ${invoice.jobTitle} is paid. You can download the receipt from this page.`,
          });
          await load();
          return;
        }
      } catch {
        // Fall through and retry; the webhook or reconciliation will still settle it.
      }
      if (cancelledSync) return;
      if (triesLeft > 0) {
        timer = window.setTimeout(() => void confirmPayment(triesLeft - 1), 3000);
      } else {
        await load();
      }
    };
    void confirmPayment(4);
    return () => {
      cancelledSync = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [searchParams, focusInvoiceId, router, load]);

  useEffect(() => {
    if (loading || !focusInvoiceId) return;
    document
      .getElementById(`invoice-${focusInvoiceId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, focusInvoiceId]);

  async function payInvoice(invoice: MatchFeeInvoice) {
    if (!stripeEnabled) {
      setError('Online payments are not available right now. Please try again later.');
      return;
    }
    setPayingId(invoice.id);
    setError(null);
    try {
      const { url } = await hostApi.payMatchFeeStripe(invoice.id);
      window.location.href = url;
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
              const canPay = invoice.status === 'PENDING' || invoice.status === 'OVERDUE';
              const busy = payingId === invoice.id;
              const postingHref = `/host/applicants/${encodeURIComponent(invoice.jobPostingId)}`;
              const focused = invoice.id === focusInvoiceId;
              return (
                <div
                  key={invoice.id}
                  id={`invoice-${invoice.id}`}
                  style={{
                    border: focused ? '2px solid #3A65DB' : '1px solid #E5E7EB',
                    boxShadow: focused ? '0 0 0 4px rgba(58,101,219,0.12)' : undefined,
                    borderRadius: 12,
                    padding: focused ? 15 : 16,
                    background: '#fff',
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#0F2A7A',
                          fontSize: 16,
                        }}
                      >
                        {invoice.jobTitle}
                      </div>
                      <MatchFeeStatusChip
                        status={invoice.status}
                        refundPendingReview={invoice.refundPendingReview}
                        stripeRefundProcessing={invoice.stripeRefundProcessing}
                        feeRetained={invoice.feeRetained}
                      />
                    </div>
                    <div style={{ fontSize: 14, color: '#111827', marginTop: 6, fontWeight: 600 }}>
                      Locum: {invoice.locumName}
                    </div>
                    {invoice.replacedByLocumName ? (
                      <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>
                        {invoice.replacedByLocumName} replaced {invoice.locumName}
                      </div>
                    ) : !invoice.stripeRefundProcessing &&
                      (invoice.replacementStatus === 'SEARCHING' ||
                        invoice.status === 'PENDING_REPLACEMENT') ? (
                      <div style={{ fontSize: 13, color: '#B45309', marginTop: 4 }}>
                        Seeking replacement for {invoice.locumName}
                      </div>
                    ) : invoice.stripeRefundProcessing ? (
                      <div style={{ fontSize: 13, color: '#9A3412', marginTop: 4 }}>
                        Refund processing at Stripe — usually 5–10 business days to your card.
                      </div>
                    ) : invoice.feeRetained ? (
                      <div style={{ fontSize: 13, color: '#4B5563', marginTop: 4 }}>
                        Match fee retained per cancellation policy (late host cancel).
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
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>
                      {formatCents(invoice.totalCents)} {invoice.currency}
                    </span>
                    {invoice.taxCents > 0 ? (
                      <span style={{ fontSize: 13, color: '#6B7280' }}>
                        {formatCents(invoice.amountCents)} fee +{' '}
                        {formatCents(invoice.taxCents)} HST ({formatTaxRate(invoice.taxRateBps)})
                      </span>
                    ) : null}
                    <span style={{ fontSize: 13, color: '#6B7280' }}>
                      Due {new Date(invoice.dueAt).toLocaleDateString('en-CA')}
                      {invoice.paidAt
                        ? ` · Paid ${new Date(invoice.paidAt).toLocaleDateString('en-CA')}`
                        : ''}
                    </span>
                  </div>
                  {invoice.refundPendingReview ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#1E40AF',
                        background: '#EFF6FF',
                        borderRadius: 8,
                        padding: '8px 12px',
                        marginTop: 10,
                      }}
                    >
                      Refund in progress. LocumLink will refund{' '}
                      {formatCents(invoice.totalCents - (invoice.refundedCents ?? 0))}{' '}
                      {invoice.currency} to your original payment method once approved.
                    </div>
                  ) : null}

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
                        {busy && payingId === invoice.id ? 'Redirecting…' : 'Pay'}
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

      {paymentNotice ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-notice-title"
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
            if (e.target === e.currentTarget) setPaymentNotice(null);
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
            }}
          >
            <div
              aria-hidden
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: paymentNotice.tone === 'success' ? '#ECFDF5' : '#EFF6FF',
                color: paymentNotice.tone === 'success' ? '#059669' : '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {paymentNotice.tone === 'success' ? (
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                ) : (
                  <path d="M12 8v5M12 16.5v.5" />
                )}
              </svg>
            </div>
            <h2
              id="payment-notice-title"
              style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f1523' }}
            >
              {paymentNotice.title}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: '#4B5563', lineHeight: 1.5 }}>
              {paymentNotice.message}
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setPaymentNotice(null)}
              style={{
                marginTop: 20,
                width: '100%',
                padding: '11px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#0F2A7A',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

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
