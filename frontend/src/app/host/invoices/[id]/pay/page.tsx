'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { hostApi } from '@/lib/api';
import { requestNativeStripeCheckout } from '@/lib/nativeShell';

/**
 * One-hop "pay now" page the match-fee reminder email links to.
 * When the email link carries a `?t=` token we mint checkout via the tokenized
 * public endpoint (no sign-in). Otherwise we fall back to the authenticated
 * endpoint (middleware ensures the host is signed in for that path).
 */
export default function HostInvoicePayRedirect() {
  return (
    <Suspense fallback={null}>
      <HostInvoicePayRedirectInner />
    </Suspense>
  );
}

function HostInvoicePayRedirectInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const invoiceId = params?.id;
  const payToken = searchParams?.get('t') ?? '';
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current || !invoiceId) return;
    started.current = true;

    (async () => {
      try {
        const { url } = payToken
          ? await hostApi.payMatchFeeStripeByToken(invoiceId, payToken)
          : await hostApi.payMatchFeeStripe(invoiceId);
        // Native shell handles Checkout + 3DS more reliably than an in-app webview.
        if (requestNativeStripeCheckout(url)) return;
        window.location.href = url;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'We could not start the payment. Please try again.',
        );
      }
    })();
  }, [invoiceId, payToken]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      {error ? (
        <>
          <h1 style={{ fontSize: 20, margin: 0 }}>Payment could not start</h1>
          <p style={{ color: '#475569', margin: 0, maxWidth: 420 }}>{error}</p>
          <Link
            href={`/host/invoices?invoiceId=${encodeURIComponent(invoiceId ?? '')}`}
            className="btn btn-primary"
            style={{ padding: 12 }}
          >
            Go to Match Fees
          </Link>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 20, margin: 0 }}>Redirecting to secure payment…</h1>
          <p style={{ color: '#475569', margin: 0, maxWidth: 420 }}>
            Taking you to Stripe to complete your match fee payment. This only
            takes a moment.
          </p>
        </>
      )}
    </div>
  );
}
