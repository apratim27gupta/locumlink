'use client';

import { Suspense, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import Logo from '@/components/Logo';
import { adminApiBase } from '@/lib/adminApi';

const OTP_LEN = 6;
const RESEND_COOLDOWN_SEC = 30;

function AdminLoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextPath = sp.get('next') || '/admin';
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function requestOtp(targetEmail: string) {
    const res = await fetch(`${adminApiBase()}/api/admin-auth/request-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = data?.message;
      throw new Error(Array.isArray(m) ? m.join(', ') : (m || 'Could not send code.'));
    }
    return typeof data?.message === 'string'
      ? data.message
      : 'If this email is registered as an admin, a verification code has been sent.';
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setInfoMessage(null);
    setBusy(true);
    try {
      const msg = await requestOtp(email);
      setInfoMessage(msg);
      setStep('otp');
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not send code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(otpOverride?: string) {
    const otp = otpOverride ?? digits.join('');
    if (otp.length < OTP_LEN) {
      setFormError('Please enter the full 6-digit code.');
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch(`${adminApiBase()}/api/admin-auth/verify-otp`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const m = data?.message;
        setFormError(
          Array.isArray(m) ? m.join(', ') : (m || 'Invalid or expired verification code.'),
        );
        return;
      }
      const data = (await res.json()) as { redirect?: string };
      router.replace(data.redirect || nextPath);
    } catch {
      setFormError('Invalid or expired verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resendBusy) return;
    setResendBusy(true);
    setFormError(null);
    try {
      await requestOtp(email);
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not resend code.';
      const match = msg.match(/(\d+)\s*second/i);
      if (match) setResendCooldown(parseInt(match[1], 10));
      else setFormError(msg);
    } finally {
      setResendBusy(false);
    }
  }

  function handleDigitChange(val: string, idx: number) {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = d;
    setDigits(next);
    if (formError) setFormError(null);
    if (d && idx < OTP_LEN - 1) refs.current[idx + 1]?.focus();
    if (d && idx === OTP_LEN - 1 && next.every((x) => x.length === 1)) {
      void handleVerify(next.join(''));
    }
  }

  function handleDigitKey(e: KeyboardEvent<HTMLInputElement>, idx: number) {
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      handleDigitChange(e.key, idx);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      if (formError) setFormError(null);
      if (idx > 0) refs.current[idx - 1]?.focus();
    }
  }

  const masked = email.replace(/(.{2}).+(@.+)/, '$1…$2');

  return (
    <>
      <AuthSplitLayout variant={step === 'otp' ? 'verify' : 'signup'}>
        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Logo size="md" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0F2A7A', marginBottom: 6 }}>
                Admin Login
              </div>
              <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.4 }}>
                Enter your authorized admin email to receive a sign-in code.
              </div>
            </div>
            {formError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.18)',
                color: '#991B1B', borderRadius: 12,
                padding: '10px 12px', fontSize: 13, fontWeight: 600,
              }}>
                {formError}
              </div>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 15 }}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: 4, padding: '14px 16px', borderRadius: 12, border: 'none',
                background: '#0F2A7A', color: '#fff', fontWeight: 700, fontSize: 15,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Sending…' : 'Continue'}
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Logo size="md" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0F2A7A', marginBottom: 6 }}>
                Enter verification code
              </div>
              <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.4 }}>
                Code sent to <strong>{masked}</strong>
              </div>
            </div>
            {infoMessage && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.18)',
                color: '#065F46', borderRadius: 12,
                padding: '10px 12px', fontSize: 13,
              }}>
                {infoMessage}
              </div>
            )}
            {formError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.18)',
                color: '#991B1B', borderRadius: 12,
                padding: '10px 12px', fontSize: 13, fontWeight: 600,
              }}>
                {formError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { refs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(e.target.value, idx)}
                  onKeyDown={(e) => handleDigitKey(e, idx)}
                  style={{
                    width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700,
                    borderRadius: 12, border: '1px solid #E5E7EB',
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={busy || digits.some((d) => !d)}
              onClick={() => void handleVerify()}
              style={{
                padding: '14px 16px', borderRadius: 12, border: 'none',
                background: '#0F2A7A', color: '#fff', fontWeight: 700, fontSize: 15,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 13, color: '#6B7280' }}>
              <button
                type="button"
                disabled={resendBusy || resendCooldown > 0}
                onClick={() => void handleResend()}
                style={{
                  background: 'none', border: 'none', color: '#0F2A7A',
                  fontWeight: 600, cursor: resendCooldown > 0 ? 'default' : 'pointer',
                }}
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : resendBusy ? 'Sending…' : 'Resend code'}
              </button>
              {' · '}
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setDigits(Array(OTP_LEN).fill(''));
                  setFormError(null);
                  setInfoMessage(null);
                }}
                style={{ background: 'none', border: 'none', color: '#0F2A7A', fontWeight: 600, cursor: 'pointer' }}
              >
                Change email
              </button>
            </div>
          </div>
        )}
      </AuthSplitLayout>
      <Link href="/home?skipSetup=1" className="home-admin-login-btn">Home</Link>
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
        <Link href="/home?skipSetup=1" className="home-admin-login-btn">Home</Link>
      </>
    }>
      <AdminLoginInner />
    </Suspense>
  );
}
