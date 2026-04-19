'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { authApi } from '@/lib/api';
import { formatSupabaseNetworkError, getSupabase } from '@/lib/supabaseClient';
import {
  saveToken,
  saveRole,
  saveEmail,
  getRole,
  getToken,
  clearAuth,
  syncCookies,
  markProfileComplete,
  isProfileComplete,
  syncProfileCompleteCookies,
  clearProfileCompleteCookies,
  popLastPath, // ← NEW: read + clear the stored last path
  clearLastPath, // ← NEW: discard it when setup is still required
  type Role,
} from '@/lib/auth';

interface AuthCtx {
  userId: string | null;
  role: Role | null;
  isLoading: boolean;
  profileComplete: boolean;
  sendOtp: (email: string, role: Role) => Promise<void>;
  verifyOtp: (
    email: string,
    otp: string,
  ) => Promise<{ role: Role; redirectTo: string }>;
  completeProfile: () => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

const NEST_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

/** Exchanges Supabase access token for Nest JWT. Returns false if the API is down or sync-supabase fails. */
async function syncNestAccessToken(): Promise<boolean> {
  const role = getRole() ?? 'locum';
  try {
    const out = await authApi.syncFromSupabase(role);
    saveToken(out.accessToken);
    syncCookies();
    return true;
  } catch {
    // Session refresh / backend offline — caller may ignore (e.g. on load) or surface (e.g. after OTP).
    return false;
  }
}

/**
 * Check the real API — never trust localStorage alone.
 * Returns true if the user already has a completed profile on the server.
 */
async function checkProfileExistsOnServer(
  role: Role,
  token: string,
): Promise<boolean> {
  try {
    if (role === 'clinic') {
      const res = await fetch(`${NEST_BASE}/api/host/profile`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const d = (await res.json()) as { exists: boolean };
      return d.exists === true;
    } else {
      const res = await fetch(`${NEST_BASE}/api/locum/profile`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const d = (await res.json()) as { exists: boolean };
      return d.exists === true;
    }
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [isLoading, setLoading] = useState(true);

  const [profileComplete, setProfileComplete] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isProfileComplete();
  });

  useEffect(() => {
    syncCookies();

    const storedRole = getRole();
    if (storedRole) setRoleState(storedRole);

    const complete = isProfileComplete();
    setProfileComplete(complete);
    syncProfileCompleteCookies();

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = getSupabase();
      supabase.auth
        .getSession()
        .then(async ({ data: { session } }) => {
          try {
            if (session?.access_token) {
              // Ensure token is stored under the currently selected role bucket.
              // If role isn't set yet, keep existing behavior by defaulting to locum.
              if (!getRole()) saveRole('locum');
              saveToken(session.access_token);
              await syncNestAccessToken();
              setUserId(session.user.id);
              syncCookies();
              syncProfileCompleteCookies();
            }
          } catch (e) {
            console.error(e);
          } finally {
            setLoading(false);
          }
        })
        .catch((e) => {
          console.error(e);
          setLoading(false);
        });

      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) {
          if (!getRole()) saveRole('locum');
          saveToken(session.access_token);
          void (async () => {
            await syncNestAccessToken();
            setUserId(session.user.id);
            syncCookies();
            syncProfileCompleteCookies();
          })();
        } else if (!session) {
          setUserId(null);
          clearProfileCompleteCookies();
        }
      });
      subscription = sub;
    } catch (e) {
      console.error(e);
      setLoading(false);
    }

    return () => subscription?.unsubscribe();
  }, []);

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  async function sendOtp(email: string, chosenRole: Role): Promise<void> {
    saveRole(chosenRole);
    setRoleState(chosenRole);
    saveEmail(email);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw formatSupabaseNetworkError(error);
    } catch (e) {
      throw formatSupabaseNetworkError(e);
    }
  }

  // ── Step 2: Verify OTP → check API → redirect (last path → dashboard → setup) ─
  async function verifyOtp(
    email: string,
    otp: string,
  ): Promise<{ role: Role; redirectTo: string }> {
    let data: Awaited<
      ReturnType<ReturnType<typeof getSupabase>['auth']['verifyOtp']>
    >['data'];
    try {
      const out = await getSupabase().auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      data = out.data;
      if (out.error) throw formatSupabaseNetworkError(out.error);
    } catch (e) {
      throw formatSupabaseNetworkError(e);
    }

    const token = data.session?.access_token;
    if (!token) throw new Error('No access token returned from Supabase');

    // 1. Save Supabase token + sync cookies before API check
    saveToken(token);
    syncCookies();

    // 2. Exchange for Nest JWT (required for Nest API — must match backend Supabase project)
    const synced = await syncNestAccessToken();
    if (!synced) {
      throw new Error(
        'Could not sign you in to the app API. Check that the backend is running on NEXT_PUBLIC_API_URL and that backend/.env.staging uses the same Supabase URL and anon key as frontend/.env.local. Remove any fake SUPABASE_SERVICE_ROLE_KEY placeholder.',
      );
    }
    setUserId(data.user?.id ?? null);

    const savedRole = (getRole() ?? 'locum') as Role;

    // 3. Use the Nest JWT (updated by syncNestAccessToken) for the profile check
    const nestToken = getToken() ?? token;

    // 4. Ask the server if this user already has a profile
    const profileExists = await checkProfileExistsOnServer(
      savedRole,
      nestToken,
    );

    let redirectTo: string;
    if (profileExists) {
      markProfileComplete();
      syncCookies();
      syncProfileCompleteCookies();
      setProfileComplete(true);

      // ── FIX Issue 1: restore the last page the user was on ──────────────
      // popLastPath() reads ll_last_path from localStorage and clears it.
      // The destination page is already authenticated so it will fetch its
      // own data normally — we are only restoring the URL, not the data.
      const lastPath = popLastPath();
      redirectTo =
        lastPath ??
        (savedRole === 'clinic' ? '/host/dashboard' : '/locum/dashboard');
    } else {
      // First time — send to setup wizard, discard any stale saved path
      clearLastPath();
      redirectTo = savedRole === 'clinic' ? '/host/setup' : '/locum/setup';
    }

    return { role: savedRole, redirectTo };
  }

  // ── Complete profile (called at end of setup wizard) ─────────────────────
  function completeProfile(): void {
    markProfileComplete();
    syncCookies();
    syncProfileCompleteCookies();
    setProfileComplete(true);
  }

  function logout(): void {
    clearAuth();
    void getSupabase().auth.signOut();
    setUserId(null);
    setRoleState(null);
    setProfileComplete(false);
  }

  return (
    <Ctx.Provider
      value={{
        userId,
        role,
        isLoading,
        profileComplete,
        sendOtp,
        verifyOtp,
        completeProfile,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
