'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import { useAuth } from '@/providers/AuthProvider';
import { getEmail, saveLastPath } from '@/lib/auth';
import type { Role } from '@/lib/auth';

type Mode = 'create' | 'signin';

const BRAND = {
    primary: '#0F2A7A',
    primaryHover: '#1E3FAF',
    teal: '#0F2A7A',
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
    const roleLocked = params.get('locked') === 'true';
    const [lockWarning, setLockWarning] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [error, setError] = useState(() => params.get('error') ?? '');
    const [busyAction, setBusyAction] = useState<null | 'email' | 'google' | 'azure'>(null);

    useEffect(() => {
        if (params.get('mode') === 'signin') setMode('signin');
        if (params.get('role') === 'clinic') setRole('clinic');
        setError(params.get('error') ?? '');
    }, [params]);

    useEffect(() => {
        if (mode === 'signin') {
            const saved = getEmail();
            if (saved) setEmail(saved);
        }
    }, [mode]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email) { setError('Please enter your email address.'); return; }
        setError('');
        setBusyAction('email');
        try {
            const nextParam = params.get('next');
            if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/auth') && !nextParam.startsWith('/home')) {
                saveLastPath(nextParam);
            }
            try { await sendOtp(email, role); }
            catch (err) { console.warn('[AuthPage] sendOtp failed, continuing to verify page:', err); }
            router.replace(`/auth/verify?role=${encodeURIComponent(role)}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            setBusyAction(null);
        }
    }

    async function handleOAuth(provider: 'google' | 'azure') {
        setError('');
        setBusyAction(provider);
        try {
            const nextParam = params.get('next');
            if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/auth') && !nextParam.startsWith('/home')) {
                saveLastPath(nextParam);
            }
            await signInWithOAuth(provider, role);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not start social sign-in. Please try again.');
            setBusyAction(null);
        }
    }

    const roleLabel = (r: Role) => (r === 'clinic' ? 'Host' : 'Locum');

    return (
        <AuthSplitLayout variant="signup">
            <h2 style={{
                width: '100%', fontSize: 28, fontWeight: 700,
                fontFamily: 'Inter, sans-serif', lineHeight: '100%',
                color: BRAND.textPrimary, marginBottom: 4,
            }}>
                {mode === 'create' ? 'Create an account' : 'Sign in'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginBottom: 32 }}>
                <p style={{
                    width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 400,
                    fontSize: 20, lineHeight: '140%', color: BRAND.textSecondary, margin: 0,
                }}>
                    {mode === 'create' ? 'I\u2019m a' : 'I\u2019m an'}
                </p>

                <div
                    style={{ display: 'flex', width: '100%', gap: 12 }}
                    role="group"
                    aria-label={mode === 'create' ? 'Account type' : 'Sign in role'}
                >
                    {(['clinic', 'locum'] as Role[]).map((r) => (
                        <button key={r} type="button"
                            onClick={() => {
                                if (roleLocked && r !== role) {
                                    setLockWarning(role === 'clinic' ? 'You are posting a job — your role is set to Host.' : 'You are exploring opportunities — your role is set to Locum.');
                                    return;
                                }
                                setLockWarning(null);
                                setRole(r);
                            }}
                            aria-pressed={role === r}
                            suppressHydrationWarning
                            style={{
                                flex: 1, padding: '10px', cursor: 'pointer',
                                fontSize: 14, fontFamily: 'inherit',
                                fontWeight: role === r ? 600 : 400,
                                background: role === r ? '#fff' : BRAND.bgGrey,
                                color: role === r ? BRAND.primary : BRAND.textMuted,
                                border: role === r ? `1px solid ${BRAND.primary}` : `1px solid ${BRAND.border}`,
                                borderRadius: 6,
                                boxSizing: 'border-box',
                                transition: 'all .15s',
                            }}>
                            {roleLabel(r)}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 32, width: '100%', boxSizing: 'border-box' }}>

                {lockWarning && (
                    <div style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 12px' }}>
                        {lockWarning}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 16, width: '100%' }}>
                    {[
                        { src: '/google.png', alt: 'Google', title: 'Google', provider: 'google' as const },
                        { src: '/ms_outlook.png', alt: 'Microsoft Outlook', title: 'Microsoft Outlook', provider: 'azure' as const },
                    ].map(({ src, alt, title, provider }) => (
                        <button key={title} type="button"
                            title={`Continue with ${title}`}
                            disabled={busyAction !== null}
                            onClick={() => handleOAuth(provider)}
                            suppressHydrationWarning
                            style={{
                                flex: 1, padding: '10px',
                                border: `1px solid ${busyAction === provider ? BRAND.primary : BRAND.border}`,
                                borderRadius: 6, background: '#fff',
                                cursor: busyAction !== null ? 'not-allowed' : 'pointer',
                                opacity: busyAction === provider ? 0.6 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                transition: 'border-color .15s, opacity .15s',
                            }}>
                            <Image src={src} alt={alt} width={28} height={28} />
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
                            onFocus={(e) => (e.currentTarget.style.borderColor = BRAND.primary)}
                            onBlur={(e) => (e.currentTarget.style.borderColor = '#D0D5DD')}
                        />
                    </div>

                    {error && <p style={{ fontSize: 12, color: BRAND.error, marginBottom: 10 }}>{error}</p>}

                    <button type="submit" disabled={busyAction === 'email'} suppressHydrationWarning
                        style={{
                            width: '100%', padding: '11px', borderRadius: 6,
                            fontSize: 18, fontWeight: 600, cursor: busyAction === 'email' ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', border: 'none', lineHeight: '140%',
                            background: busyAction === 'email' ? BRAND.primaryHover : BRAND.primary,
                            color: '#fff', opacity: busyAction === 'email' ? 0.75 : 1,
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
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, fontFamily: 'inherit', color: BRAND.primaryHover }}>
                            Sign in
                        </button>
                    </>
                ) : (
                    <>Don&apos;t have an account?{' '}
                        <button type="button" onClick={() => setMode('create')}
                            style={{ background: 'none', border: 'none', color: BRAND.primary, cursor: 'pointer', fontSize: 18, fontFamily: 'inherit', fontWeight: 500 }}>
                            Sign up
                        </button>
                    </>
                )}
            </p>
        </AuthSplitLayout>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={null}>
            <AuthPageInner />
        </Suspense>
    );
}
