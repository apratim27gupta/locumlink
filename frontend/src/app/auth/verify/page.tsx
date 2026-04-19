'use client';

import { useRef, useState, useEffect, KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import { useAuth } from '@/providers/AuthProvider';
import { getEmail, getRole, saveRole, type Role } from '@/lib/auth';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

const OTP_LEN = 6;

const RESEND_COOLDOWN_SEC = 30;

export default function VerifyPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyOtp, sendOtp } = useAuth();

  // Role from `/auth/verify?role=` (set after sendOtp) — keeps sync if URL is refreshed.
  useEffect(() => {
    const r = searchParams.get('role');
    if (r === 'clinic' || r === 'locum') saveRole(r as Role);
  }, [searchParams]);

  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Countdown timer — auto-resends when it reaches 0 ──────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => {
      setResendCooldown((c) => {
        if (c - 1 === 0) handleResend(); // auto-resend when timer expires
        return c - 1;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function handleChange(val: string, idx: number) {
    const d = val.replace(/\D/, '').slice(-1);
    const next = [...digits];
    next[idx] = d;
    setDigits(next);
    if (d && idx < OTP_LEN - 1) refs.current[idx + 1]?.focus();
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  }

  async function handleVerify() {
    const otp = digits.join('');
    if (otp.length < OTP_LEN) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    const email = getEmail();
    if (!email) {
      router.replace('/auth');
      return;
    }

    setError('');
    setBusy(true);

    try {
      const { redirectTo } = await verifyOtp(email, otp);
      router.replace(redirectTo);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Invalid code. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resendBusy) return;

    const email = getEmail();
    const role = getRole();
    if (!email || !role) {
      router.replace('/auth');
      return;
    }

    setResendBusy(true);
    setError('');
    try {
      await sendOtp(email, role);
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not resend the code.';
      // Backend says "after X seconds" → start countdown with that value
      const match = msg.match(/(\d+)\s*second/i);
      if (match) {
        setResendCooldown(parseInt(match[1], 10));
      } else {
        setError(msg);
      }
    } finally {
      setResendBusy(false);
    }
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const email = (mounted ? getEmail() : null) ?? 'your email';
  const masked = email.replace(/(.{2}).+(@.+)/, '$1…$2');

  return (
    <AuthSplitLayout variant="verify">
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: '#0f1523',
          marginBottom: 4,
        }}
      >
        Verify your email
      </h2>
      <p style={{ fontSize: 16, color: '#0A0A0A', marginBottom: 24 }}>
        Enter OTP sent to <strong style={{ color: '#0f1523' }}>{masked}</strong>
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(e.target.value, i)}
            onKeyDown={(e) => handleKey(e, i)}
            style={{
              width: 44,
              height: 52,
              textAlign: 'center',
              fontSize: 22,
              fontWeight: 700,
              border: `2px solid ${d ? '#3B4FD8' : '#d0d4e4'}`,
              borderRadius: 6,
              background: d ? '#eef0fb' : '#fff',
              color: '#0f1523',
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color .15s',
            }}
          />
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
          {error}
        </p>
      )}

      <button
        onClick={handleVerify}
        disabled={busy}
        style={{
          width: '100%',
          padding: '11px',
          border: 'none',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 500,
          cursor: busy ? 'default' : 'pointer',
          background: busy ? '#8892a4' : '#3B4FD8',
          color: '#fff',
          fontFamily: 'inherit',
          marginBottom: 12,
        }}
      >
        {busy ? 'Verifying…' : 'Verify Code'}
      </button>

      {/* ── Resend row ─────────────────────────────────────────────────────── */}
      {resendCooldown > 0 ? (
        // Figma: "You can  Resend  the code in 30 seconds"
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 4,
            height: 22,
            fontSize: 16,
            fontFamily: 'Gilroy-Medium, Inter, sans-serif',
            fontWeight: 400,
            lineHeight: '140%',
            color: '#4A4A4A',
            marginBottom: 12,
          }}
        >
          <span>You can</span>
          <span>Resend</span>
          <span>the code in {resendCooldown} seconds</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={resendBusy}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            fontSize: 13,
            marginBottom: 6,
            padding: 0,
            border: 'none',
            background: 'none',
            fontFamily: 'inherit',
            color: resendBusy ? '#8892a4' : '#3B4FD8',
            cursor: resendBusy ? 'default' : 'pointer',
          }}
        >
          {resendBusy ? 'Resending mail…' : 'Resend Code'}
        </button>
      )}

      <p
        onClick={() => router.back()}
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: '#5a6478',
          cursor: 'pointer',
        }}
      >
        ← Edit email
      </p>
    </AuthSplitLayout>
  );
}