'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import Logo from '@/components/Logo';
import { adminApiBase } from '@/lib/adminApi';

const ALLOWED_ADMIN_EMAIL = 'aroradamini873@gmail.com';

function AdminLoginInner() {
  const sp = useSearchParams();
  const nextPath = sp.get('next') || '/admin';
  const error = sp.get('error');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reasonText = useMemo(() => {
    const reason = sp.get('reason');
    if (!reason) return '';
    try {
      return decodeURIComponent(reason);
    } catch {
      return reason;
    }
  }, [sp]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setFormError('Enter your email address.');
      return;
    }
    if (normalized !== ALLOWED_ADMIN_EMAIL) {
      setFormError('This email is not authorized for admin access.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${adminApiBase()}/api/admin-auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirect?: string;
        message?: string | string[];
      };
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || 'Could not sign in.';
        setFormError(msg);
        return;
      }
      window.location.assign(
        typeof data.redirect === 'string' && data.redirect.startsWith('http')
          ? data.redirect
          : nextPath,
      );
    } catch {
      setFormError('Could not reach the server. Is the API running?');
    } finally {
      setBusy(false);
    }
  }

  const showDenied = error === 'not_allowed';

  return (
    <AuthSplitLayout variant="signup">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size="md" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0F2A7A', marginBottom: 6 }}>
            Admin Login
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.4 }}>
            Enter your authorized admin email to continue.
          </div>
        </div>

        {showDenied ? (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.18)',
              color: '#991B1B',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13,
              lineHeight: 1.4,
              fontWeight: 700,
            }}
          >
            Access denied.
            {reasonText ? (
              <>
                <br />
                <span style={{ fontWeight: 600 }}>Detail:</span> {reasonText}
              </>
            ) : null}
          </div>
        ) : null}

        {formError ? (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.18)',
              color: '#991B1B',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13,
              lineHeight: 1.4,
              fontWeight: 600,
            }}
          >
            {formError}
          </div>
        ) : null}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ALLOWED_ADMIN_EMAIL}
            disabled={busy}
            style={{
              height: 46,
              borderRadius: 12,
              border: '1px solid rgba(15, 42, 122, 0.18)',
              padding: '0 14px',
              fontSize: 15,
              fontFamily: 'inherit',
              color: '#0F2A7A',
              outline: 'none',
            }}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          style={{
            height: 46,
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #1c32d2 0%, #3a65db 100%)',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.75 : 1,
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 800,
            color: '#fff',
            boxShadow: '0 2px 12px rgba(28, 50, 210, 0.35)',
          }}
        >
          {busy ? 'Signing in…' : 'Continue to admin'}
        </button>
      </form>
    </AuthSplitLayout>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <AuthSplitLayout variant="signup">
          <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Loading…</div>
        </AuthSplitLayout>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}
