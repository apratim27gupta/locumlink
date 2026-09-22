'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DashLayout from '@/components/DashLayout';
import {
  MatchFeePolicyModal,
  hostMatchFeeRefundEligible,
  matchFeeStatusColor,
  matchFeeStatusLabel,
} from '@/components/payments/MatchFeePolicy';
import { MatchFeeEventTimeline } from '@/components/payments/MatchFeeEventTimeline';
import {
  MatchFeeRefundConfirmModal,
  matchFeeOutlineButtonStyle,
} from '@/components/payments/MatchFeeRefundConfirmModal';
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
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundConfirmInvoice, setRefundConfirmInvoice] = useState<MatchFeeInvoice | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

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

  async function confirmRefund() {
    if (!refundConfirmInvoice) return;
    setRefundingId(refundConfirmInvoice.id);
    setError(null);
    try {
      await hostApi.cancelAcceptedMatch(
        refundConfirmInvoice.applicationId,
        'Host requested match fee refund per cancellation policy.',
      );
      setRefundConfirmInvoice(null);
      setBanner('Refund submitted. Your invoice will update shortly.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund request failed.');
    } finally {
      setRefundingId(null);
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
        <p style={{ margin: '0 0 8px', color: '#6B7280', fontSize: 14, lineHeight: 1.5 }}>
          Free to post. Pay $125 or $250 per matched locum when they accept your confirmed match.
        </p>
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
              const canRefund = hostMatchFeeRefundEligible(invoice);
              const busy = payingId === invoice.id || refundingId === invoice.id;
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
                    {canRefund ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRefundConfirmInvoice(invoice)}
                        style={matchFeeOutlineButtonStyle(busy)}
                      >
                        Request refund
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MatchFeePolicyModal
        policy={policy}
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
      />
      <MatchFeeRefundConfirmModal
        invoice={refundConfirmInvoice}
        open={refundConfirmInvoice != null}
        busy={refundingId != null}
        onClose={() => {
          if (!refundingId) setRefundConfirmInvoice(null);
        }}
        onConfirm={() => void confirmRefund()}
      />
    </DashLayout>
  );
}
