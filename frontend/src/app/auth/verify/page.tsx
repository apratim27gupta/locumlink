'use client';
import { useRef, useState, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import { useAuth } from '@/providers/AuthProvider';
import { getEmail, getRole, saveRole, syncCookies, type Role } from '@/lib/auth';
import { toUserFacingError } from '@/lib/userFacingError';
import TurnstileWidget, { isTurnstileEnabled } from '@/components/TurnstileWidget';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { roleAccent } from '@/lib/roleAccent';
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
    useEffect(() => {
        const r = searchParams.get('role');
        if (r === 'clinic' || r === 'locum')
            saveRole(r as Role);
    }, [searchParams]);
    const roleParam = searchParams.get('role');
    const accentRole: Role =
        roleParam === 'clinic' || roleParam === 'locum'
            ? roleParam
            : getRole() === 'clinic'
              ? 'clinic'
              : 'locum';
    const accent = roleAccent(accentRole);
    const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(''));
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [resendBusy, setResendBusy] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const turnstileRequired = isTurnstileEnabled();
    const refs = useRef<(HTMLInputElement | null)[]>([]);
    const digitsRef = useRef(digits);
    digitsRef.current = digits;
    useEffect(() => {
        if (resendCooldown <= 0)
            return;
        const t = setTimeout(() => {
            setResendCooldown((c) => Math.max(0, c - 1));
        }, 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    function authHref() {
        return `/auth?mode=signin&role=${encodeURIComponent(accentRole)}&locked=true`;
    }

    function applyOtpDigits(raw: string, startIdx = 0) {
        const nums = raw.replace(/\D/g, '').slice(0, OTP_LEN - startIdx);
        if (!nums) return;
        const next = [...digitsRef.current];
        for (let i = 0; i < nums.length; i++) {
            next[startIdx + i] = nums[i]!;
        }
        setDigits(next);
        if (error) setError('');
        const focusIdx = Math.min(startIdx + nums.length, OTP_LEN - 1);
        refs.current[focusIdx]?.focus();
        if (next.every((d) => d.length === 1)) {
            void handleVerify(next.join(''));
        }
    }

    function handleChange(val: string, idx: number) {
        const cleaned = val.replace(/\D/g, '');
        if (cleaned.length > 1) {
            applyOtpDigits(cleaned, idx);
            return;
        }
        const d = cleaned.slice(-1);
        const next = [...digitsRef.current];
        next[idx] = d;
        setDigits(next);
        if (error)
            setError('');
        if (d && idx < OTP_LEN - 1)
            refs.current[idx + 1]?.focus();
        if (d && idx === OTP_LEN - 1 && next.every((x) => x.length === 1)) {
            void handleVerify(next.join(''));
        }
    }
    function handleKey(e: KeyboardEvent<HTMLInputElement>, idx: number) {
        // Allow clipboard shortcuts (Ctrl/Cmd+V, etc.)
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^\d$/.test(e.key)) {
            e.preventDefault();
            handleChange(e.key, idx);
            return;
        }
        if (e.key === 'Backspace') {
            e.preventDefault();
            const next = [...digitsRef.current];
            next[idx] = '';
            setDigits(next);
            if (error)
                setError('');
            if (idx > 0) {
                refs.current[idx - 1]?.focus();
            }
            return;
        }
        if (!['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
        }
    }
    function handlePaste(e: ClipboardEvent<HTMLInputElement>, idx: number) {
        e.preventDefault();
        applyOtpDigits(e.clipboardData.getData('text') || '', idx);
    }
    async function handleVerify(otpOverride?: string) {
        const otp = otpOverride ?? digitsRef.current.join('');
        if (otp.length < OTP_LEN) {
            setError('Please enter the full 6-digit code.');
            return;
        }
        const email = getEmail();
        if (!email) {
            router.replace(authHref());
            return;
        }
        // Lock role from the URL before calling the API (avoids Host→Locum drift).
        saveRole(accentRole);
        setError('');
        setBusy(true);
        try {
            const { redirectTo } = await verifyOtp(email, otp, accentRole);
            syncCookies();
            router.replace(redirectTo);
        }
        catch (err: unknown) {
            saveRole(accentRole);
            setError(toUserFacingError(err, 'Could not verify the code. Please try again.'));
        }
        finally {
            setBusy(false);
        }
    }
    async function handleResend() {
        if (resendCooldown > 0 || resendBusy)
            return;
        const email = getEmail();
        if (!email) {
            router.replace(authHref());
            return;
        }
        if (turnstileRequired && !captchaToken) {
            setError('Please complete the captcha check before resending.');
            setResendCooldown(0);
            return;
        }
        saveRole(accentRole);
        setResendBusy(true);
        setError('');
        setResendCooldown(RESEND_COOLDOWN_SEC);
        try {
            await sendOtp(email, accentRole, captchaToken ?? undefined);
            setCaptchaToken(null);
        }
        catch (err: unknown) {
            const raw = err instanceof Error ? err.message : '';
            const match = raw.match(/(\d+)\s*second/i);
            if (match) {
                setResendCooldown(parseInt(match[1], 10));
            }
            else {
                setResendCooldown(0);
                setError(toUserFacingError(err, 'Could not resend the code. Please try again.'));
            }
        }
        finally {
            setResendBusy(false);
        }
    }
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
    const email = (mounted ? getEmail() : null) ?? 'your email';
    const masked = email.replace(/(.{2}).+(@.+)/, '$1…$2');
    const otpComplete = digits.every((digit) => digit.length === 1);
    return (<>
    <AuthSplitLayout variant="verify">
      <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 4,
        }}>
        Verify your email
      </h2>
      <p style={{ fontSize: 16, color: '#0A0A0A', marginBottom: 24, lineHeight: 1.45 }}>
        Enter OTP sent to <strong style={{ color: '#0f1523' }}>{masked}</strong>
      </p>

      <div className="auth-verify-body">
        <div className="auth-verify-otp-row">
          {digits.map((d, i) => (<input key={i} ref={(el) => {
                  refs.current[i] = el;
              }} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={i === 0 ? OTP_LEN : 1} value={d} onFocus={(e) => e.target.select()} onChange={(e) => handleChange(e.target.value, i)} onKeyDown={(e) => handleKey(e, i)} onPaste={(e) => handlePaste(e, i)} aria-label={`Digit ${i + 1} of ${OTP_LEN}`} style={{
                  width: 44,
                  height: 52,
                  textAlign: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  border: `2px solid ${d ? accent.primary : '#d0d4e4'}`,
                  borderRadius: 6,
                  background: d ? accent.light : '#fff',
                  color: '#0f1523',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color .15s',
                  boxSizing: 'border-box',
              }}/>))}
        </div>

        {error && (<p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
            {error}
          </p>)}

        <button onClick={() => void handleVerify()} disabled={busy || !otpComplete} style={{
              width: '100%',
              padding: '11px',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: busy || !otpComplete ? 'default' : 'pointer',
              background: busy || !otpComplete ? '#8892a4' : accent.primary,
              color: '#fff',
              fontFamily: 'inherit',
              marginBottom: 12,
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxSizing: 'border-box',
          }}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>

        <div style={{ marginBottom: 12 }}>
          <TurnstileWidget onToken={setCaptchaToken} />
        </div>

        {resendCooldown > 0 ? (<p style={{
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  color: '#4A4A4A',
                  margin: '0 0 10px',
                  padding: '11px 12px',
                  boxSizing: 'border-box',
              }}>
            You can resend the code in {resendCooldown}{' '}
            {resendCooldown === 1 ? 'second' : 'seconds'}.
          </p>) : (<button type="button" onClick={handleResend} disabled={resendBusy || (turnstileRequired && !captchaToken)} style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 10,
                  padding: '11px 12px',
                  border: `1px solid ${accent.primary}59`,
                  borderRadius: 6,
                  background: '#fff',
                  fontFamily: 'inherit',
                  color: accent.primary,
                  cursor: resendBusy ? 'wait' : 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  boxSizing: 'border-box',
                  lineHeight: 1.2,
              }}>
            Resend Code
          </button>)}

        <button type="button" onClick={() => router.push(authHref())} style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 500,
              color: accent.primary,
              cursor: 'pointer',
              margin: 0,
              padding: '11px 12px',
              border: `1px solid ${accent.primary}59`,
              borderRadius: 6,
              background: '#fff',
              fontFamily: 'inherit',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxSizing: 'border-box',
              lineHeight: 1.2,
          }}>
          Edit Email
        </button>
      </div>
    </AuthSplitLayout>
    <Link href="/home?skipSetup=1" className="home-admin-login-btn">Home</Link>
    </>);
}
