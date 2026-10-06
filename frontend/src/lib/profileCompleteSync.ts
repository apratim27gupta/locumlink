import {
    getRole,
    getToken,
    isProfileComplete,
    markProfileComplete,
    markProfileCompleteForRole,
    syncProfileCompleteCookies,
    syncCookies,
    type Role,
} from '@/lib/auth';

/** Browser: same-origin `/api/*` via Next rewrites (matches api.ts). */
const NEST_BASE =
    typeof window === 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
        : '';

function profileCheckUrl(role: Role): string {
    const path = role === 'clinic' ? '/api/host/profile' : '/api/locum/profile';
    return NEST_BASE ? `${NEST_BASE}${path}` : path;
}

export async function checkProfileExistsOnServer(
    role: Role,
    token: string,
): Promise<boolean> {
    try {
        const res = await fetch(profileCheckUrl(role), {
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

/** Sync profile-complete flags for one role when the server already has a profile row. */
export async function syncProfileCompleteFromServerForRole(
    role: Role,
    token?: string | null,
): Promise<boolean> {
    if (typeof window === 'undefined')
        return false;
    const tok = token ?? getToken();
    if (!tok)
        return false;
    const exists = await checkProfileExistsOnServer(role, tok);
    if (!exists)
        return false;
    markProfileCompleteForRole(role);
    syncCookies();
    return true;
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
    return syncProfileCompleteFromServerForRole(role, token);
}
