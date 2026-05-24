'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import Logo from '@/components/Logo';
import { adminApiBase } from '@/lib/adminApi';
import Image from 'next/image';

function AdminLoginInner() {
  const sp = useSearchParams();
  const nextPath = sp.get('next') || '/admin';
  const error = sp.get('error');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reasonText = useMemo(() => {
    const reason = sp.get('reason');
    if (!reason) return '';
    try { return decodeURIComponent(reason); }
    catch { return reason; }
  }, [sp]);

  function handleGoogleLogin() {
    setBusy(true);
    window.location.assign(`${adminApiBase()}/api/admin-auth/google`);
  }

  const showDenied = error === 'not_allowed';

  return (
    <>
    <AuthSplitLayout variant="signup">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size="md" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0F2A7A', marginBottom: 6 }}>
            Admin Login
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.4 }}>
            Sign in with your authorized Google account.
          </div>
        </div>

        {showDenied && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.18)',
            color: '#991B1B', borderRadius: 12,
            padding: '10px 12px', fontSize: 13,
            lineHeight: 1.4, fontWeight: 700,
          }}>
            Access denied.
            {reasonText && <><br /><span style={{ fontWeight: 600 }}>Detail:</span> {reasonText}</>}
          </div>
        )}

        {formError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.18)',
            color: '#991B1B', borderRadius: 12,
            padding: '10px 12px', fontSize: 13,
            lineHeight: 1.4, fontWeight: 600,
          }}>
            {formError}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={busy}
          style={{
            height: 46, borderRadius: 12,
            border: '1px solid rgba(15, 42, 122, 0.18)',
            background: '#fff',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.75 : 1,
            fontFamily: 'inherit', fontSize: 15,
            fontWeight: 700, color: '#0F2A7A',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
          }}
        >
          <Image src="/google.png" alt="Google" width={22} height={22} />
          {busy ? 'Redirecting…' : 'Continue with Google'}
        </button>
      </div>
    </AuthSplitLayout>
    <Link href="/home" className="home-admin-login-btn">Home</Link>
    </>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <>
        <AuthSplitLayout variant="signup">
          <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Loading…</div>
        </AuthSplitLayout>
        <Link href="/home" className="home-admin-login-btn">Home</Link>
      </>
    }>
      <AdminLoginInner />
    </Suspense>
  );
}
