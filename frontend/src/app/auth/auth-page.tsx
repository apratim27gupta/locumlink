'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import { useAuth } from '@/providers/AuthProvider';
import { getEmail, saveLastPath } from '@/lib/auth'; // ← added saveLastPath
import type { Role } from '@/lib/auth';

type Mode = 'create' | 'signin';

const emailInput: React.CSSProperties = {
  width: 376,
  height: 44,
  boxSizing: 'border-box',
  padding: '6px 8px',
  border: '1px solid #D0D5DD',
  borderRadius: 8,
  gap: 29,
  fontSize: 16,
  fontWeight: 400,
  lineHeight: '140%',
  color: '#0f1523',
  background: '#fff',
  opacity: 1,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color .15s',
};

export default function AuthPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { sendOtp } = useAuth();

  const [mode, setMode] = useState<Mode>(() =>
    params.get('mode') === 'signin' ? 'signin' : 'create',
  );
  const [role, setRole] = useState<Role>(() =>
    params.get('role') === 'clinic' ? 'clinic' : 'locum',
  );

  // ── FIX Issue 9: pre-fill email when returning user opens sign-in ─────────
  // getEmail() reads ll_email from localStorage (set when they previously
  // entered their email). We only pre-fill in sign-in mode so new users
  // always start with an empty field.
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (params.get('mode') === 'signin') setMode('signin');
    if (params.get('role') === 'clinic') setRole('clinic');
  }, [params]);

  // When mode switches to sign-in, populate the saved email (if any)
  useEffect(() => {
    if (mode === 'signin') {
      const saved = getEmail();
      if (saved) setEmail(saved);
    }
  }, [mode]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      // Capture where the user came from so after OTP we can send them back.
      // `next` is set by middleware on protected-route redirects.
      const nextParam = params.get('next');
      if (
        nextParam &&
        nextParam.startsWith('/') &&
        !nextParam.startsWith('//') &&
        !nextParam.startsWith('/auth') &&
        !nextParam.startsWith('/home')
      ) {
        saveLastPath(nextParam);
      }

      await sendOtp(email, role);
      router.replace(`/auth/verify?role=${encodeURIComponent(role)}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const btnStyle: React.CSSProperties = {
    width: '100%',
    opacity: 1,
    padding: '11px',
    borderRadius: 6,
    fontSize: 18,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: 'none',
    lineHeight: '140%',
  };

  return (
    <AuthSplitLayout variant="signup">
      <h2
        style={{
          width: 376,
          height: 28,
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          fontStyle: 'normal',
          lineHeight: '100%',
          letterSpacing: '0%',
          color: '#0A0A0A',
          display: 'flex',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        {mode === 'create' ? 'Create an account' : 'Sign in'}
      </h2>

      {mode === 'create' && (
        <p
          style={{
            width: 376,
            height: 28,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 400,
            fontStyle: 'normal',
            fontSize: 20,
            lineHeight: '140%',
            letterSpacing: 0,
            color: '#4A4A4A',
            margin: 0,
          }}
        >
          I&apos;m a
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: 0,
          gap: 32,
          width: 376,
          height: 398,
          boxSizing: 'border-box',
          opacity: 1,
        }}
      >
        {/* Clinic / Locum toggle — create mode only */}
        {mode === 'create' && (
          <div
            style={{
              display: 'flex',
              width: '100%',
              border: '1px solid #e2e5ee',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {(['clinic', 'locum'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                suppressHydrationWarning
                style={{
                  flex: 1,
                  padding: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  fontWeight: role === r ? 500 : 400,
                  background: role === r ? '#3B4FD8' : '#F1F3F7',
                  color: role === r ? '#fff' : '#5a6478',
                  transition: 'all .15s',
                }}
              >
                {r === 'clinic' ? 'Clinic' : 'Locum'}
              </button>
            ))}
          </div>
        )}

        {/* Social logins — wired up in Issue 8 */}
        <div style={{ display: 'flex', gap: 24, width: '100%' }}>
          {[
            { src: '/google.png', alt: 'Google', title: 'Google' },
            { src: '/apple.png', alt: 'Apple', title: 'Apple' },
            {
              src: '/ms_outlook.png',
              alt: 'Microsoft Outlook',
              title: 'Microsoft Outlook',
            },
          ].map(({ src, alt, title }) => (
            <button
              key={title}
              type="button"
              title={`Continue with ${title}`}
              suppressHydrationWarning
              style={{
                flex: 1,
                padding: '9px',
                border: '1px solid #e2e5ee',
                borderRadius: 6,
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image src={src} alt={alt} width={28} height={28} />
            </button>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
          }}
        >
          <div style={{ flex: 1, height: 1, background: '#e2e5ee' }} />
          <span style={{ fontSize: 11, color: '#8892a4' }}>Or</span>
          <div style={{ flex: 1, height: 1, background: '#e2e5ee' }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 29,
              width: 376,
              marginBottom: 14,
            }}
          >
            <label
              style={{
                display: 'block',
                fontSize: 20,
                fontWeight: 400,
                lineHeight: '140%',
                color: '#4A4A4A',
                opacity: 1,
                margin: 0,
              }}
            >
              E-mail address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="johndoe@example.com"
              suppressHydrationWarning
              style={emailInput}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#3B4FD8')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#d0d4e4')}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            suppressHydrationWarning
            style={{
              ...btnStyle,
              background: busy ? '#8892a4' : '#3B4FD8',
              color: '#fff',
              opacity: busy ? 0.8 : 1,
            }}
          >
            {busy
              ? 'Sending code…'
              : mode === 'create'
                ? 'Create account'
                : 'Continue'}
          </button>
        </form>
      </div>

      <p
        style={{
          textAlign: 'center',
          fontSize: 18,
          color: '#8892a4',
          marginTop: 16,
        }}
      >
        {mode === 'create' ? (
          <>
            Already have an account?{' '}
            <button
              type="button"
              className="auth-page-signin-link"
              onClick={() => setMode('signin')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                fontWeight: 400,
                fontFamily: 'Inter, sans-serif',
                fontStyle: 'normal',
                lineHeight: '140%',
                letterSpacing: '0%',
              }}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <button
              onClick={() => setMode('create')}
              style={{
                background: 'none',
                border: 'none',
                color: '#3B4FD8',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Sign up
            </button>
          </>
        )}
      </p>
    </AuthSplitLayout>
  );
}
