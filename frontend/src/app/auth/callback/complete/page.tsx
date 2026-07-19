'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthSplitLayout from '@/components/AuthSplitLayout';
import { useAuth } from '@/providers/AuthProvider';
import { toUserFacingError } from '@/lib/userFacingError';
import { saveRole } from '@/lib/auth';
import { completeAppleWebSignInFromStorage } from '@/lib/appleWebSignIn';
import { getSupabase } from '@/lib/supabaseClient';

function AuthCallbackCompleteInner() {
    const router = useRouter();
    const { completeOAuthSignIn } = useAuth();
    const params = useSearchParams();
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const roleFromUrl = params.get('role') as 'clinic' | 'locum' | null;
                if (roleFromUrl) saveRole(roleFromUrl);
                const provider = params.get('provider');
                if (provider === 'apple') {
                    const handled = await completeAppleWebSignInFromStorage();
                    if (!handled) {
                        throw new Error('Apple sign-in session expired. Please try again.');
                    }
                } else {
                    const code = params.get('code');
                    if (code) {
                        const supabase = getSupabase();
                        const { error: exchangeError } =
                            await supabase.auth.exchangeCodeForSession(code);
                        if (exchangeError) throw new Error(exchangeError.message);
                    }
                }
                const { redirectTo } = await completeOAuthSignIn();
                if (!cancelled)
                    router.replace(redirectTo);
            }
            catch (err: unknown) {
                if (!cancelled) {
                    setError(toUserFacingError(err, 'Could not complete sign-in. Please try again.'));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [completeOAuthSignIn, params, router]);
    return (<AuthSplitLayout variant="signup">
      <h2 className="auth-callback-heading" style={{
            width: '100%',
            maxWidth: 376,
            fontSize: 28,
            fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
            lineHeight: '100%',
            color: '#0A0A0A',
            marginBottom: 16,
        }}>
        Completing sign in
      </h2>
      <p className="auth-callback-text" style={{
            width: '100%',
            maxWidth: 376,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            lineHeight: '140%',
            color: error ? '#dc2626' : '#4A4A4A',
            margin: 0,
        }}>
        {error || 'Please wait while we finish setting up your session.'}
      </p>
    </AuthSplitLayout>);
}

export default function AuthCallbackCompletePage() {
    return (
        <Suspense fallback={
            <AuthSplitLayout variant="signup">
                <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Loading…</div>
            </AuthSplitLayout>
        }>
            <AuthCallbackCompleteInner />
        </Suspense>
    );
}
