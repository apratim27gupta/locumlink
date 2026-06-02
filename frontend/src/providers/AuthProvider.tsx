'use client';
import { createContext, useContext, useEffect, useState, ReactNode, } from 'react';
import { getAppOrigin } from '@/lib/appOrigin';
import { authApi } from '@/lib/api';
import { formatSupabaseNetworkError, getSupabase } from '@/lib/supabaseClient';
import { saveToken, saveRole, saveEmail, getRole, getToken, clearAuth, syncCookies, markProfileComplete, isProfileComplete, syncProfileCompleteCookies, popLastPath, clearLastPath, type Role, } from '@/lib/auth';
import { checkProfileExistsOnServer, ensureProfileMarkedCompleteFromServer, } from '@/lib/profileCompleteSync';
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
    signInWithOAuth: (provider: 'google' | 'azure', role: Role) => Promise<void>;
    completeOAuthSignIn: () => Promise<{ role: Role; redirectTo: string }>;
}
const Ctx = createContext<AuthCtx | null>(null);
async function syncNestAccessToken(): Promise<boolean> {
    const role = getRole() ?? 'locum';
    try {
        const out = await authApi.syncFromSupabase(role);
        saveToken(out.accessToken);
        syncCookies();
        return true;
    }
    catch {
        return false;
    }
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
                        saveToken(session.access_token);
                        await syncNestAccessToken();
                        setUserId(session.user.id);
                        syncCookies();
                        syncProfileCompleteCookies();
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
            const { data: { subscription: sub }, } = supabase.auth.onAuthStateChange((_event, session) => {
                if (session?.access_token) {
                    if (!getRole())
                        saveRole('locum');
                    saveToken(session.access_token);
                    void (async () => {
                        await syncNestAccessToken();
                        setUserId(session.user.id);
                        syncCookies();
                        syncProfileCompleteCookies();
                    })();
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
        // Dev mode: skip Supabase OTP email, use 000000
    }
    async function verifyOtp(email: string, otp: string): Promise<{
        role: Role;
        redirectTo: string;
    }> {
        // Dev bypass: OTP 000000 skips Supabase
        if (otp === '000000') {
            const role = (getRole() ?? 'locum') as Role;
            const NEST = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
            const res = await fetch(`${NEST}/api/auth/dev-otp-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role: role === 'clinic' ? 'clinic' : 'locum' }),
            });
            if (!res.ok) {
                let detail = 'Dev login failed';
                try {
                    const j = await res.json() as { message?: string };
                    if (j.message)
                        detail = j.message;
                }
                catch {
                    try {
                        detail = await res.text();
                    }
                    catch { /* keep default */ }
                }
                if (/ECONNREFUSED|connect/i.test(detail))
                    throw new Error('Dev login failed: database is not running. Start Docker Desktop, then run: npm run db:up');
                throw new Error(detail);
            }
            const tokens = await res.json();
            saveToken(tokens.accessToken);
            syncCookies();
            setUserId(tokens.userId ?? null);
            const profileExists = await checkProfileExistsOnServer(role, tokens.accessToken);
            let redirectTo: string;
            if (profileExists) {
                markProfileComplete(); syncCookies(); syncProfileCompleteCookies(); setProfileComplete(true);
                const lastPath = popLastPath();
                redirectTo = lastPath ?? (role === 'clinic' ? '/host/dashboard' : '/locum/dashboard');
            } else {
                clearLastPath();
                redirectTo = role === 'clinic' ? '/host/setup' : '/locum/setup';
            }
            return { role, redirectTo };
        }
        let data: Awaited<ReturnType<ReturnType<typeof getSupabase>['auth']['verifyOtp']>>['data'];
        try {
            const out = await getSupabase().auth.verifyOtp({
                email,
                token: otp,
                type: 'email',
            });
            data = out.data;
            if (out.error)
                throw formatSupabaseNetworkError(out.error);
        }
        catch (e) {
            throw formatSupabaseNetworkError(e);
        }
        const token = data.session?.access_token;
        if (!token)
            throw new Error('No access token returned from Supabase');
        saveToken(token);
        syncCookies();
        const synced = await syncNestAccessToken();
        if (!synced) {
            throw new Error('Could not sign you in to the app API. Check that the backend is running on NEXT_PUBLIC_API_URL and that backend/.env.staging uses the same Supabase URL and anon key as frontend/.env.local. Remove any fake SUPABASE_SERVICE_ROLE_KEY placeholder.');
        }
        setUserId(data.user?.id ?? null);
        const savedRole = (getRole() ?? 'locum') as Role;
        const nestToken = getToken() ?? token;
        const profileExists = await checkProfileExistsOnServer(savedRole, nestToken);
        let redirectTo: string;
        if (profileExists) {
            markProfileComplete();
            syncCookies();
            syncProfileCompleteCookies();
            setProfileComplete(true);
            const lastPath = popLastPath();
            redirectTo =
                lastPath ??
                    (savedRole === 'clinic' ? '/host/dashboard' : '/locum/dashboard');
        }
        else {
            clearLastPath();
            redirectTo = savedRole === 'clinic' ? '/host/setup' : '/locum/setup';
        }
        return { role: savedRole, redirectTo };
    }
    async function signInWithOAuth(provider: 'google' | 'azure', chosenRole: Role): Promise<void> {
        saveRole(chosenRole);
        setRoleState(chosenRole);
        const supabase = getSupabase();
        const redirectTo = `${getAppOrigin()}/auth/callback`;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: provider === 'azure' ? 'azure' : 'google',
            options: { redirectTo },
        });
        if (error) throw new Error(error.message);
    }
    async function completeOAuthSignIn(): Promise<{ role: Role; redirectTo: string }> {
        const supabase = getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw new Error(error.message);
        if (!session?.access_token) throw new Error('No session found after OAuth redirect.');
        saveToken(session.access_token);
        syncCookies();
        const synced = await syncNestAccessToken();
        if (!synced) throw new Error('Could not sync session with app API.');
        setUserId(session.user.id);
        const savedRole = (getRole() ?? 'locum') as Role;
        const nestToken = getToken() ?? session.access_token;
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
