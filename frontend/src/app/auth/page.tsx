'use client';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import AppleIcon from '@/components/icons/AppleIcon';
import GoogleIcon from '@/components/icons/GoogleIcon';
import MicrosoftIcon from '@/components/icons/MicrosoftIcon';
import { useAuth } from '@/providers/AuthProvider';
import { getEmail, saveLastPath } from '@/lib/auth';
import type { Role } from '@/lib/auth';
import { sanitizeErrorMessage, toUserFacingError } from '@/lib/userFacingError';
import TurnstileWidget, { isTurnstileEnabled } from '@/components/TurnstileWidget';
import { roleAccent, ROLE_GUIDE } from '@/lib/roleAccent';

type Mode = 'create' | 'signin';

const BRAND = {
    border: '#e2e5ee',
    textPrimary: '#0A0A0A',
    textSecondary: '#4A4A4A',
    textMuted: '#8892a4',
    bgGrey: '#F1F3F7',
    error: '#dc2626',
} as const;

const emailInput: React.CSSProperties = {
    width: '100%',
    height: 44,
    boxSizing: 'border-box',
    padding: '6px 8px',
    border: '1px solid #D0D5DD',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 400,
    lineHeight: '140%',
    color: BRAND.textPrimary,
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color .15s',
};

function AuthPageInner() {
    const router = useRouter();
    const params = useSearchParams();
    const { sendOtp, signInWithOAuth } = useAuth();
    const [mode, setMode] = useState<Mode>(() => params.get('mode') === 'signin' ? 'signin' : 'create');
    const [role, setRole] = useState<Role>(() => params.get('role') === 'clinic' ? 'clinic' : 'locum');
    const [email, setEmail] = useState('');
    const [error, setError] = useState(() => sanitizeErrorMessage(params.get('error')));
    const [busyAction, setBusyAction] = useState<
        null | 'email' | 'apple' | 'google' | 'azure'
    >(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const turnstileRequired = isTurnstileEnabled();

    useEffect(() => {
        if (params.get('mode') === 'signin') setMode('signin');
        else if (params.get('mode') === 'create') setMode('create');
        if (params.get('role') === 'clinic') setRole('clinic');
        else if (params.get('role') === 'locum') setRole('locum');
        setError(sanitizeErrorMessage(params.get('error')));
    }, [params]);

    useEffect(() => {
        if (mode === 'signin') {
            const saved = getEmail();
            if (saved) setEmail(saved);
        }
    }, [mode]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmedEmail = email.trim();
        if (!trimmedEmail) { setError('Please enter your email address.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            setError('Please enter a valid email address.');
            return;
        }
        if (turnstileRequired && !captchaToken) {
            setError('Please complete the captcha check.');
            return;
        }
        setError('');
        setBusyAction('email');
        try {
            const nextParam = params.get('next');
            if (nextParam)
                saveLastPath(nextParam, role);
            await sendOtp(trimmedEmail, role, captchaToken ?? undefined);
            router.replace(`/auth/verify?role=${encodeURIComponent(role)}`);
        } catch (err: unknown) {
            setError(toUserFacingError(err));
        } finally {
            setBusyAction(null);
        }
    }

    async function handleOAuth(provider: 'apple' | 'google' | 'azure') {
        setError('');
        setBusyAction(provider);
        try {
            const nextParam = params.get('next');
            if (nextParam)
                saveLastPath(nextParam, role);
            await signInWithOAuth(provider, role);
        } catch (err: unknown) {
            setError(toUserFacingError(err, 'Could not start social sign-in. Please try again.'));
        } finally {
            setBusyAction(null);
        }
    }

    const accent = roleAccent(role);
    const roleLabel = role === 'clinic' ? 'Host' : 'Locum';

    return (
        <>
        <AuthSplitLayout variant="signup">
            <h2 style={{
                width: '100%', fontSize: 28, fontWeight: 700,
                fontFamily: 'Inter, sans-serif', lineHeight: '100%',
                color: BRAND.textPrimary, marginBottom: 4,
            }}>
                {mode === 'create' ? 'Create an account' : 'Sign in'}
            </h2>
            <p style={{
                width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 400,
                fontSize: 16, lineHeight: '140%', color: BRAND.textSecondary,
                margin: '8px 0 28px',
            }}>
                Continuing as <strong style={{ color: accent.primary }}>{roleLabel}</strong>
                {' · '}
                <span style={{ color: BRAND.textMuted }}>{ROLE_GUIDE[role]}</span>
            </p>

            <div className="auth-signup-form-stack">

                <div className="auth-oauth-row">
                    {([
                        {
                            title: 'Apple',
                            provider: 'apple' as const,
                            icon: <AppleIcon size={24} />,
                        },
                        {
                            title: 'Google',
                            provider: 'google' as const,
                            icon: <GoogleIcon size={24} />,
                        },
                        {
                            title: 'Microsoft Outlook',
                            provider: 'azure' as const,
                            icon: <MicrosoftIcon size={24} />,
                        },
                    ] as const).map(({ title, provider, icon }) => (
                        <button key={title} type="button"
                            title={`Continue with ${title}`}
                            disabled={busyAction !== null}
                            onClick={() => handleOAuth(provider)}
                            suppressHydrationWarning
                            className="auth-oauth-btn"
                            style={{
                                border: `1px solid ${busyAction === provider ? accent.primary : BRAND.border}`,
                                opacity: busyAction === provider ? 0.6 : 1,
                            }}>
                            <span className="auth-oauth-btn__icon">{icon}</span>
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                    <div style={{ flex: 1, height: 1, background: BRAND.border }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#98a2b3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Or</span>
                    <div style={{ flex: 1, height: 1, background: BRAND.border }} />
                </div>

                <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginBottom: 14 }}>
                        <label style={{ fontSize: 20, fontWeight: 400, lineHeight: '140%', color: BRAND.textSecondary }}>
                            E-mail address
                        </label>
                        <input
                            type="email" value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="example@gmail.com"
                            suppressHydrationWarning
                            style={emailInput}
                            onFocus={(e) => (e.currentTarget.style.borderColor = accent.primary)}
                            onBlur={(e) => (e.currentTarget.style.borderColor = '#D0D5DD')}
                        />
                    </div>

                    {error && <p style={{ fontSize: 12, color: BRAND.error, marginBottom: 10 }}>{error}</p>}

                    <div style={{ marginBottom: 14 }}>
                        <TurnstileWidget onToken={setCaptchaToken} />
                    </div>

                    <button type="submit" disabled={busyAction === 'email' || (turnstileRequired && !captchaToken)} suppressHydrationWarning
                        style={{
                            width: '100%', padding: '11px', borderRadius: 6,
                            fontSize: 18, fontWeight: 600, cursor: busyAction === 'email' ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', border: 'none', lineHeight: '140%',
                            background: busyAction === 'email' ? accent.primaryHover : accent.primary,
                            color: '#fff',
                            opacity: busyAction === 'email' ? 0.75 : 1,
                            transition: 'background .15s, opacity .15s',
                        }}>
                        {busyAction === 'email' ? 'Sending code\u2026' : mode === 'create' ? 'Create account' : 'Continue'}
                    </button>
                </form>
            </div>

            <p style={{ textAlign: 'center', fontSize: 18, color: BRAND.textMuted, marginTop: 16 }}>
                {mode === 'create' ? (
                    <>Already have an account?{' '}
                        <button type="button" className="auth-page-signin-link"
                            onClick={() => setMode('signin')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, fontFamily: 'inherit', color: accent.primaryHover }}>
                            Sign in
                        </button>
                    </>
                ) : (
                    <>Don&apos;t have an account?{' '}
                        <button type="button" onClick={() => setMode('create')}
                            style={{ background: 'none', border: 'none', color: accent.primary, cursor: 'pointer', fontSize: 18, fontFamily: 'inherit', fontWeight: 500 }}>
                            Sign up
                        </button>
                    </>
                )}
            </p>
        </AuthSplitLayout>
        <Link href="/home?skipSetup=1" className="home-admin-login-btn">Home</Link>
        </>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={
            <>
                <AuthSplitLayout variant="signup">
                    <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Loading…</div>
                </AuthSplitLayout>
                <Link href="/home?skipSetup=1" className="home-admin-login-btn">Home</Link>
            </>
        }>
            <AuthPageInner />
        </Suspense>
    );
}
