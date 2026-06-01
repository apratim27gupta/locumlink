import {
    getRole,
    getToken,
    isProfileComplete,
    markProfileComplete,
    syncProfileCompleteCookies,
    type Role,
} from '@/lib/auth';

const NEST_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
);

export async function checkProfileExistsOnServer(
    role: Role,
    token: string,
): Promise<boolean> {
    try {
        const path =
            role === 'clinic' ? '/api/host/profile' : '/api/locum/profile';
        const res = await fetch(`${NEST_BASE}${path}`, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok)
            return false;
        const d = (await res.json()) as { exists: boolean };
        return d.exists === true;
    }
    catch {
        return false;
    }
}

/** Sync local profile-complete flags when the server already has a profile row. */
export async function ensureProfileMarkedCompleteFromServer(): Promise<boolean> {
    if (typeof window === 'undefined')
        return false;
    if (isProfileComplete()) {
        syncProfileCompleteCookies();
        return true;
    }
    const role = getRole();
    const token = getToken();
    if (!role || !token)
        return false;
    const exists = await checkProfileExistsOnServer(role, token);
    if (!exists)
        return false;
    markProfileComplete();
    syncProfileCompleteCookies();
    return true;
}
