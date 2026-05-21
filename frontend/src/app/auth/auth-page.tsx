'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import { useAuth } from '@/providers/AuthProvider';
import { getEmail, saveLastPath } from '@/lib/auth';
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
    const { sendOtp, signInWithOAuth } = useAuth();
    const [mode, setMode] = useState<Mode>(() => params.get('mode') === 'signin' ? 'signin' : 'create');
    const [role, setRole] = useState<Role>(() => params.get('role') === 'clinic' ? 'clinic' : 'locum');
    const [email, setEmail] = useState('');
    const [error, setError] = useState(() => params.get('error') ?? '');
    const [busyAction, setBusyAction] = useState<null | 'email' | 'google' | 'azure'>(null);
    useEffect(() => {
        if (params.get('mode') === 'signin')
            setMode('signin');
        if (params.get('role') === 'clinic')
            setRole('clinic');
        setError(params.get('error') ?? '');
    }, [params]);
    useEffect(() => {
        if (mode === 'signin') {
            const saved = getEmail();
            if (saved)
                setEmail(saved);
        }
    }, [mode]);
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email) {
            setError('Please enter your email address.');
            return;
        }
        setError('');
        setBusyAction('email');
        try {
            const nextParam = params.get('next');
            if (nextParam &&
                nextParam.startsWith('/') &&
                !nextParam.startsWith('//') &&
                !nextParam.startsWith('/auth') &&
                !nextParam.startsWith('/home')) {
                saveLastPath(nextParam);
            }
            try {
                await sendOtp(email, role);
            }
            catch (err) {
                // DEV BYPASS — SMTP may fail before Zepto is configured; continue to OTP page.
                console.warn('[AuthPage] sendOtp failed, continuing to verify page:', err);
            }
            router.replace(`/auth/verify?role=${encodeURIComponent(role)}`);
        }
        catch (err: unknown) {
            setError(err instanceof Error
                ? err.message
                : 'Something went wrong. Please try again.');
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleOAuth(provider: 'google' | 'azure') {
        setError('');
        setBusyAction(provider);
        try {
            const nextParam = params.get('next');
            if (nextParam &&
                nextParam.startsWith('/') &&
                !nextParam.startsWith('//') &&
                !nextParam.startsWith('/auth') &&
                !nextParam.startsWith('/home')) {
                saveLastPath(nextParam);
            }
            await signInWithOAuth(provider, role);
        }
        catch (err: unknown) {
            setError(err instanceof Error
                ? err.message
                : 'Could not start social sign-in. Please try again.');
            setBusyAction(null);
        }
    }
    const roleLabel = (r: Role) => (r === 'clinic' ? 'Host' : 'Locum');

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
    return (<AuthSplitLayout variant="signup">
      <h2 style={{
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
        }}>
        {mode === 'create' ? 'Create an account' : 'Sign in'}
      </h2>

      <p style={{
            width: 376,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 400,
            fontStyle: 'normal',
            fontSize: 20,
            lineHeight: '140%',
            letterSpacing: 0,
            color: '#4A4A4A',
            margin: 0,
        }}>
        {mode === 'create' ? 'I\u2019m a' : 'I\u2019m an'}
      </p>

      <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: 0,
            gap: 32,
            width: 376,
            boxSizing: 'border-box',
            opacity: 1,
        }}>
        <div style={{
                display: 'flex',
                width: '100%',
                border: '1px solid #e2e5ee',
                borderRadius: 6,
                overflow: 'hidden',
            }}
            role="group"
            aria-label={mode === 'create' ? 'Account type' : 'Sign in role'}
        >
            {(['clinic', 'locum'] as Role[]).map((r) => (<button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r} suppressHydrationWarning style={{
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
                }}>
                {roleLabel(r)}
              </button>))}
        </div>

        
        <div style={{ display: 'flex', gap: 24, width: '100%' }}>
          {[
            { src: '/google.png', alt: 'Google', title: 'Google', provider: 'google' as const },
            {
                src: '/ms_outlook.png',
                alt: 'Microsoft Outlook',
                title: 'Microsoft Outlook',
                provider: 'azure' as const,
            },
        ].map(({ src, alt, title, provider }) => (<button key={title} type="button" title={`Continue with ${title}`} disabled={busyAction === provider} onClick={() => handleOAuth(provider)} suppressHydrationWarning style={{
                flex: 1,
                padding: '9px',
                border: busyAction === provider ? '1px solid #2438B8' : '1px solid #e2e5ee',
                borderRadius: 6,
                background: busyAction === provider ? '#2438B8' : '#fff',
                cursor: busyAction === provider ? 'not-allowed' : 'pointer',
                opacity: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background .15s, border-color .15s',
            }}>
              <Image src={src} alt={alt} width={28} height={28}/>
            </button>))}
        </div>

        
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
        }}>
          <div style={{ flex: 1, height: 1, background: '#e2e5ee' }}/>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#98a2b3',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '0 6px',
            lineHeight: 1,
        }}>
            Or
          </span>
          <div style={{ flex: 1, height: 1, background: '#e2e5ee' }}/>
        </div>

        
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 29,
            width: 376,
            marginBottom: 14,
        }}>
            <label style={{
            display: 'block',
            fontSize: 20,
            fontWeight: 400,
            lineHeight: '140%',
            color: '#4A4A4A',
            opacity: 1,
            margin: 0,
        }}>
              E-mail address
            </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@gmail.com" suppressHydrationWarning style={emailInput} onFocus={(e) => (e.currentTarget.style.borderColor = '#3B4FD8')} onBlur={(e) => (e.currentTarget.style.borderColor = '#d0d4e4')}/>
          </div>

          {error && (<p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>
              {error}
            </p>)}

          <button type="submit" disabled={busyAction === 'email'} suppressHydrationWarning style={{
            ...btnStyle,
            background: busyAction === 'email' ? '#2438B8' : '#3B4FD8',
            color: '#fff',
            opacity: 1,
            cursor: busyAction === 'email' ? 'not-allowed' : 'pointer',
            transition: 'background .15s',
        }}>
            {busyAction === 'email'
            ? 'Sending code…'
            : mode === 'create'
                ? 'Create account'
                : 'Continue'}
          </button>
        </form>
      </div>

      <p style={{
            textAlign: 'center',
            fontSize: 18,
            color: '#8892a4',
            marginTop: 16,
        }}>
        {mode === 'create' ? (<>
            Already have an account?{' '}
            <button type="button" className="auth-page-signin-link" onClick={() => setMode('signin')} style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                fontWeight: 400,
                fontFamily: 'Inter, sans-serif',
                fontStyle: 'normal',
                lineHeight: '140%',
                letterSpacing: '0%',
            }}>
              Sign in
            </button>
          </>) : (<>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => setMode('create')} style={{
                background: 'none',
                border: 'none',
                color: '#3B4FD8',
                cursor: 'pointer',
                fontSize: 18,
                fontWeight: 400,
                fontFamily: 'Inter, sans-serif',
                fontStyle: 'normal',
                lineHeight: '140%',
                letterSpacing: '0%',
            }}>
              Sign up
            </button>
          </>)}
      </p>
    </AuthSplitLayout>);
}
