'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fetchAllPaginated,
  hostApi,
  type ApplicationRecord,
  type MatchFeeInvoice,
} from '@/lib/api';
import { beforeClientNavigation } from '@/lib/topLoader';
import { matchFeeStatusColor, matchFeeStatusLabel } from '@/components/payments/MatchFeePolicy';

export type ApplicationInvoiceLink = {
  invoice: MatchFeeInvoice;
  /** `replacement`: this locum replaced the invoice's original locum and is covered by that fee. */
  role: 'own' | 'replacement';
};

/** Map applicationId → the invoice that bills it (own) or covers it (replacement). */
export function buildInvoiceByApplication(
  invoices: MatchFeeInvoice[],
): Map<string, ApplicationInvoiceLink> {
  const map = new Map<string, ApplicationInvoiceLink>();
  for (const inv of invoices) map.set(inv.applicationId, { invoice: inv, role: 'own' });
  for (const inv of invoices) {
    if (inv.replacementApplicationId && !map.has(inv.replacementApplicationId)) {
      map.set(inv.replacementApplicationId, { invoice: inv, role: 'replacement' });
    }
  }
  return map;
}

/** Loads a posting's match fee invoices keyed by application. */
export function usePostingInvoices(
  jobPostingId: string | null | undefined,
): Map<string, ApplicationInvoiceLink> {
  const [invoices, setInvoices] = useState<MatchFeeInvoice[]>([]);
  useEffect(() => {
    if (!jobPostingId) return;
    let cancelled = false;
    fetchAllPaginated((cursor) => hostApi.listMatchFees({ jobPostingId, limit: 50, cursor }))
      .then((items) => {
        if (!cancelled) setInvoices(items);
      })
      .catch(() => {
        if (!cancelled) setInvoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [jobPostingId]);
  return useMemo(() => buildInvoiceByApplication(invoices), [invoices]);
}

export function invoiceHref(invoiceId: string): string {
  return `/host/invoices?invoiceId=${encodeURIComponent(invoiceId)}`;
}

/** Invoice column cell: Pay button, status badge, or replacement note linking to the invoice. */
export function ApplicationInvoiceCell({
  app,
  link,
}: {
  app: Pick<ApplicationRecord, 'status' | 'locumResponse'>;
  link: ApplicationInvoiceLink | undefined;
}) {
  const subStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  if (!link) {
    const awaitingLocum = app.status === 'CONFIRMED' && app.locumResponse !== 'ACCEPTED';
    return (
      <span style={{ fontSize: 12, color: '#9CA3AF' }}>
        {awaitingLocum ? 'Awaiting locum' : '—'}
      </span>
    );
  }
  const { invoice, role } = link;
  const href = invoiceHref(invoice.id);
  const onNavigate = () => beforeClientNavigation(href);
  if (role === 'replacement') {
    return (
      <div style={{ minWidth: 0 }}>
        <Link
          href={href}
          onClick={onNavigate}
          style={{ fontSize: 13, fontWeight: 600, color: '#1C32D2', textDecoration: 'none' }}
        >
          No fee · View
        </Link>
        <div
          style={subStyle}
          title={`Replaced ${invoice.locumName}; covered by the original match fee`}
        >
          Replaced {invoice.locumName}
        </div>
      </div>
    );
  }
  const payable = invoice.status === 'PENDING' || invoice.status === 'OVERDUE';
  if (payable) {
    const overdue = invoice.status === 'OVERDUE';
    return (
      <div style={{ minWidth: 0 }}>
        <Link
          href={href}
          onClick={onNavigate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 12px',
            borderRadius: 8,
            background: overdue
              ? '#B91C1C'
              : 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Pay ${(invoice.amountCents / 100).toFixed(0)}
        </Link>
        {overdue ? <div style={{ ...subStyle, color: '#B91C1C' }}>Overdue</div> : null}
      </div>
    );
  }
  const colors = matchFeeStatusColor(invoice.status);
  return (
    <div style={{ minWidth: 0 }}>
      <Link
        href={href}
        onClick={onNavigate}
        style={{
          display: 'inline-flex',
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {matchFeeStatusLabel(invoice.status)}
      </Link>
      {invoice.replacedByLocumName ? (
        <div
          style={subStyle}
          title={`${invoice.replacedByLocumName} replaced ${invoice.locumName}`}
        >
          Replaced by {invoice.replacedByLocumName}
        </div>
      ) : null}
    </div>
  );
}
