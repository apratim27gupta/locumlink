'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import Logo from '@/components/Logo';

export default function AdminLoginPage() {
  const sp = useSearchParams();
  const next = sp.get('next') ?? '/admin/dashboard';
  const error = sp.get('error');

  const apiBase = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    return raw.replace(/\/$/, '');
  }, []);

  const googleHref = `${apiBase}/api/admin-auth/google`;

  return (
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
            Sign in with your approved admin Google account.
          </div>
        </div>

        {error ? (
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
            This Google account is not allowed for admin access.
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            const url = new URL(googleHref);
            // keep "next" for future extension; currently backend redirects to ADMIN_FRONTEND_REDIRECT_URL
            url.searchParams.set('next', next);
            window.location.href = url.toString();
          }}
          style={{
            height: 46,
            borderRadius: 12,
            border: '1px solid rgba(15, 42, 122, 0.18)',
            background: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 800,
            color: '#0F2A7A',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: 'rgba(56, 198, 198, 0.18)',
              border: '1px solid rgba(56, 198, 198, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#0F2A7A',
              fontWeight: 900,
            }}
          >
            G
          </span>
          Continue with Google
        </button>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', lineHeight: 1.4 }}>
          This admin login is separate from Locum/Clinic login.
        </div>
      </div>
    </AuthSplitLayout>
  );
}

