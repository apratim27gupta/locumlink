'use client';
import { createContext, useContext, useEffect, useState, ReactNode, } from 'react';
import { authApi } from '@/lib/api';
import { getSupabase } from '@/lib/supabaseClient';
import { toUserFacingError } from '@/lib/userFacingError';
import { saveToken, saveRole, saveEmail, getRole, getToken, clearAuth, syncCookies, markProfileComplete, isProfileComplete, syncProfileCompleteCookies, popLastPath, clearLastPath, type Role, } from '@/lib/auth';
import { checkProfileExistsOnServer, ensureProfileMarkedCompleteFromServer, } from '@/lib/profileCompleteSync';
import { getOAuthCallbackRedirect, isNativeShell } from '@/lib/nativeShell';
interface AuthCtx {
    userId: string | null;
    role: Role | null;
    isLoading: boolean;
    profileComplete: boolean;
    sendOtp: (email: string, role: Role) => Promise<void>;
    verifyOtp: (email: string, otp: string) => Promise<{
        role: Role;
        redirectTo: string;
    }>;
    completeProfile: () => void;
    logout: () => void;
    signInWithOAuth: (
        provider: 'apple' | 'google' | 'azure',
        role: Role,
    ) => Promise<void>;
    completeOAuthSignIn: () => Promise<{ role: Role; redirectTo: string }>;
}
const Ctx = createContext<AuthCtx | null>(null);

let syncNestInFlight: Promise<boolean> | null = null;

/** Exchange Supabase access token for Nest JWT — never store Supabase token as ll_access. */
async function syncNestAccessToken(supabaseAccessToken: string): Promise<boolean> {
    if (syncNestInFlight) return syncNestInFlight;
    syncNestInFlight = (async () => {
        const role = getRole() ?? 'locum';
        try {
            const out = await authApi.syncFromSupabase(role, supabaseAccessToken);
            saveToken(out.accessToken);
            syncCookies();
            return true;
        }
        catch {
            return false;
        }
        finally {
            syncNestInFlight = null;
        }
    })();
    return syncNestInFlight;
}
export function AuthProvider({ children }: {
    children: ReactNode;
}) {
    const [userId, setUserId] = useState<string | null>(null);
    const [role, setRoleState] = useState<Role | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [profileComplete, setProfileComplete] = useState(() => {
        if (typeof window === 'undefined')
            return false;
        return isProfileComplete();
    });
    useEffect(() => {
        syncCookies();
        const storedRole = getRole();
        if (storedRole)
            setRoleState(storedRole);
        const complete = isProfileComplete();
        setProfileComplete(complete);
        syncProfileCompleteCookies();
        void ensureProfileMarkedCompleteFromServer().then((synced) => {
            if (synced)
                setProfileComplete(true);
        });
        let subscription: {
            unsubscribe: () => void;
        } | undefined;
        try {
            const supabase = getSupabase();
            supabase.auth
                .getSession()
                .then(async ({ data: { session } }) => {
                try {
                    if (session?.access_token) {
                        if (!getRole())
                            saveRole('locum');
                        const synced = await syncNestAccessToken(session.access_token);
                        if (synced || getToken()) {
                            setUserId(session.user.id);
                            syncCookies();
                            syncProfileCompleteCookies();
                        }
                    }
                }
                catch (e) {
                    console.error(e);
                }
                finally {
                    setLoading(false);
                }
            })
                .catch((e) => {
                console.error(e);
                setLoading(false);
            });
            const { data: { subscription: sub }, } = supabase.auth.onAuthStateChange((event, session) => {
                if (session?.access_token) {
                    if (!getRole())
                        saveRole('locum');
                    if (
                        event === 'SIGNED_IN'
                        || event === 'INITIAL_SESSION'
                        || event === 'TOKEN_REFRESHED'
                    ) {
                        void (async () => {
                            await syncNestAccessToken(session.access_token);
                            setUserId(session.user.id);
                            syncCookies();
                            syncProfileCompleteCookies();
                        })();
                    }
                }
                else if (!session) {
                    setUserId(null);
                }
            });
            subscription = sub;
        }
        catch (e) {
            console.error(e);
            setLoading(false);
        }
        return () => subscription?.unsubscribe();
    }, []);
    async function sendOtp(email: string, chosenRole: Role): Promise<void> {
        saveRole(chosenRole);
        setRoleState(chosenRole);
        saveEmail(email);
        await authApi.sendOtp(email, chosenRole);
    }
    async function verifyOtp(email: string, otp: string): Promise<{
        role: Role;
        redirectTo: string;
    }> {
        const role = (getRole() ?? 'locum') as Role;
        let tokens: { accessToken: string; refreshToken: string };
        try {
            tokens = await authApi.verifyOtp(
                email,
                otp,
                role === 'clinic' ? 'clinic' : 'locum',
            );
        }
        catch (err) {
            throw new Error(toUserFacingError(err, 'Could not verify the code. Please try again.'));
        }
        setUserId(null);
        saveToken(tokens.accessToken);
        syncCookies();
        const profileExists = await checkProfileExistsOnServer(role, tokens.accessToken);
        let redirectTo: string;
        if (profileExists) {
            markProfileComplete();
            syncCookies();
            syncProfileCompleteCookies();
            setProfileComplete(true);
            const lastPath = popLastPath();
            redirectTo =
                lastPath ??
                (role === 'clinic' ? '/host/dashboard' : '/locum/dashboard');
        } else {
            clearLastPath();
            redirectTo = role === 'clinic' ? '/host/setup' : '/locum/setup';
        }
        return { role, redirectTo };
    }
    async function signInWithOAuth(
        provider: 'apple' | 'google' | 'azure',
        chosenRole: Role,
    ): Promise<void> {
        saveRole(chosenRole);
        setRoleState(chosenRole);
        const supabase = getSupabase();
        const redirectTo = getOAuthCallbackRedirect(chosenRole);
        const inNativeShell = isNativeShell();
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider === 'azure' ? 'azure' : provider,
            options: {
                redirectTo,
                skipBrowserRedirect: inNativeShell,
                ...(provider === 'azure' && {
                    scopes: 'openid profile email',
                    queryParams: {
                        prompt: 'select_account',
                    },
                }),
            },
        });

        if (error) throw new Error(error.message);
        if (inNativeShell && data?.url) {
            window.location.assign(data.url);
        }
    }
    async function completeOAuthSignIn(): Promise<{ role: Role; redirectTo: string }> {
        const supabase = getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw new Error(error.message);
        if (!session?.access_token) throw new Error('No session found after OAuth redirect.');
        syncCookies();
        const synced = await syncNestAccessToken(session.access_token);
        if (!synced) throw new Error('Could not sync session with app API.');
        setUserId(session.user.id);
        const savedRole = (getRole() ?? 'locum') as Role;
        const nestToken = getToken();
        if (!nestToken) throw new Error('Could not sync session with app API.');
        const profileExists = await checkProfileExistsOnServer(savedRole, nestToken);
        let redirectTo: string;
        if (profileExists) {
            markProfileComplete(); syncCookies(); syncProfileCompleteCookies(); setProfileComplete(true);
            const lastPath = popLastPath();
            redirectTo = lastPath ?? (savedRole === 'clinic' ? '/host/dashboard' : '/locum/dashboard');
        } else {
            clearLastPath();
            redirectTo = savedRole === 'clinic' ? '/host/setup' : '/locum/setup';
        }
        return { role: savedRole, redirectTo };
    }
    function completeProfile(): void {
        markProfileComplete();
        syncCookies();
        syncProfileCompleteCookies();
        setProfileComplete(true);
    }
    function logout(): void {
        clearAuth();
        clearLastPath();
        void getSupabase().auth.signOut();
        setUserId(null);
        setRoleState(null);
        setProfileComplete(false);
    }
    return (<Ctx.Provider value={{
            userId,
            role,
            isLoading,
            profileComplete,
            sendOtp,
            verifyOtp,
            completeProfile,
            logout,
            signInWithOAuth,
            completeOAuthSignIn,
        }}>
      {children}
    </Ctx.Provider>);
}
export function useAuth(): AuthCtx {
    const ctx = useContext(Ctx);
    if (!ctx)
        throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
