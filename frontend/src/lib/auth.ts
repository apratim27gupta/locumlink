export type Role = 'clinic' | 'locum';
const TOKEN_KEY_CLINIC = 'll_access_clinic';
const TOKEN_KEY_LOCUM = 'll_access_locum';
const TOKEN_KEY_LEGACY = 'll_access';
const ROLE_KEY = 'll_role';
const EMAIL_KEY = 'll_email';
const LAST_PATH_KEY = 'll_last_path';
const LAST_PATH_KEY_CLINIC = 'll_last_path_clinic';
const LAST_PATH_KEY_LOCUM = 'll_last_path_locum';

function lastPathStorageKey(role: Role): string {
    return role === 'clinic' ? LAST_PATH_KEY_CLINIC : LAST_PATH_KEY_LOCUM;
}

function roleForPath(path: string): Role | null {
    if (path.startsWith('/host'))
        return 'clinic';
    if (path.startsWith('/locum'))
        return 'locum';
    return null;
}

function readBrowserCookie(name: string): string | null {
    if (typeof document === 'undefined')
        return null;
    const parts = document.cookie.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx === -1)
            continue;
        const key = part.slice(0, idx).trim();
        if (key !== name)
            continue;
        try {
            return decodeURIComponent(part.slice(idx + 1).trim());
        }
        catch {
            return part.slice(idx + 1).trim();
        }
    }
    return null;
}

function asFrontendRole(value: string | null | undefined): Role | null {
    if (value === 'clinic' || value === 'locum')
        return value;
    if (value === 'HOST' || value === 'host')
        return 'clinic';
    if (value === 'LOCUM')
        return 'locum';
    return null;
}

/** Map Nest JWT `role` claim (HOST/LOCUM) to frontend Role. */
export function roleFromNestJwt(token: string | null | undefined): Role | null {
    if (!token || typeof window === 'undefined')
        return null;
    try {
        const payload = token.split('.')[1];
        if (!payload)
            return null;
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const normalized = base64.padEnd(
            base64.length + ((4 - (base64.length % 4)) % 4),
            '=',
        );
        const decoded = JSON.parse(window.atob(normalized)) as { role?: unknown };
        return asFrontendRole(
            typeof decoded.role === 'string' ? decoded.role : null,
        );
    }
    catch {
        return null;
    }
}

/**
 * Resolve the active host/locum role without silently inventing "locum".
 * On /host|/locum routes the path wins (middleware already gated the cookie).
 * Otherwise: localStorage ↔ role cookie (cookie wins on conflict) → Nest JWT → lone role token.
 */
export function inferSessionRole(pathname?: string | null): Role | null {
    if (typeof window === 'undefined')
        return null;
    const path =
        pathname
        ?? (typeof window !== 'undefined' ? window.location.pathname : null);
    const pathRole = path ? roleForPath(path) : null;
    if (pathRole)
        return pathRole;

    const fromLs = asFrontendRole(localStorage.getItem(ROLE_KEY));
    const fromCookie = asFrontendRole(readBrowserCookie(ROLE_KEY));
    if (fromLs && fromCookie && fromLs !== fromCookie)
        return fromCookie;
    if (fromLs)
        return fromLs;
    if (fromCookie)
        return fromCookie;

    const fromAccessCookie = roleFromNestJwt(readBrowserCookie('ll_access'));
    if (fromAccessCookie)
        return fromAccessCookie;
    const clinicTok = localStorage.getItem(TOKEN_KEY_CLINIC);
    const locumTok = localStorage.getItem(TOKEN_KEY_LOCUM);
    if (clinicTok && !locumTok)
        return 'clinic';
    if (locumTok && !clinicTok)
        return 'locum';
    const clinicRole = roleFromNestJwt(clinicTok);
    if (clinicRole)
        return clinicRole;
    const locumRole = roleFromNestJwt(locumTok);
    if (locumRole)
        return locumRole;
    return roleFromNestJwt(localStorage.getItem(TOKEN_KEY_LEGACY));
}

/** Host/locum deep links only — never auth, home, or admin. */
function isStorableLastPath(path: string): boolean {
    if (!path || path === '/' || path.startsWith('//'))
        return false;
    if (path.startsWith('/auth') || path.startsWith('/home') || path.startsWith('/admin'))
        return false;
    return roleForPath(path) !== null;
}
function setCookie(name: string, value: string, days = 365): void {
    if (typeof document === 'undefined')
        return;
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    const secure =
        typeof window !== 'undefined' && window.location.protocol === 'https:'
            ? '; Secure'
            : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax${secure}`;
}
function deleteCookie(name: string): void {
    if (typeof document === 'undefined')
        return;
    const secure =
        typeof window !== 'undefined' && window.location.protocol === 'https:'
            ? '; Secure'
            : '';
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}
export function saveToken(token: string): void {
    if (typeof window === 'undefined')
        return;
    const role = getRole();
    const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
    localStorage.setItem(key, token);
    setCookie('ll_access', token, 365);
}

/** Persist JWT for a specific role and make it the active session (no clearSession). */
export function activateRole(role: Role, token: string): void {
    if (typeof window === 'undefined')
        return;
    const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
    localStorage.setItem(key, token);
    localStorage.setItem(ROLE_KEY, role);
    setCookie(ROLE_KEY, role, 365);
    setCookie('ll_access', token, 365);
    syncProfileCompleteCookies();
}

export function hasStoredToken(role: Role): boolean {
    if (typeof window === 'undefined')
        return false;
    const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
    return Boolean(localStorage.getItem(key));
}

/** Peek last path for a role without clearing it. */
export function peekLastPath(role?: Role | null): string | null {
    if (typeof window === 'undefined')
        return null;
    const resolvedRole = role ?? getRole();
    if (!resolvedRole)
        return null;
    const path = localStorage.getItem(lastPathStorageKey(resolvedRole));
    if (path && isStorableLastPath(path) && roleForPath(path) === resolvedRole)
        return path;
    return null;
}

export function getToken(): string | null {
    if (typeof window === 'undefined')
        return null;
    const role = getRole();
    if (role) {
        const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
        const v = localStorage.getItem(key);
        if (v)
            return v;
    }
    else {
        const clinic = localStorage.getItem(TOKEN_KEY_CLINIC);
        if (clinic)
            return clinic;
        const locum = localStorage.getItem(TOKEN_KEY_LOCUM);
        if (locum)
            return locum;
    }
    const legacy = localStorage.getItem(TOKEN_KEY_LEGACY);
    if (legacy) {
        const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
        if (key)
            localStorage.setItem(key, legacy);
        return legacy;
    }
    // Heal from cookie when localStorage role tokens were cleared but session cookie remains.
    const fromCookie = readBrowserCookie('ll_access');
    if (fromCookie) {
        const cookieRole = roleFromNestJwt(fromCookie) ?? role;
        if (cookieRole) {
            const key =
                cookieRole === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
            localStorage.setItem(key, fromCookie);
        }
        return fromCookie;
    }
    return null;
}
export function saveRole(role: Role): void {
    if (typeof window === 'undefined')
        return;
    localStorage.setItem(ROLE_KEY, role);
    setCookie(ROLE_KEY, role, 365);
}
export function getRole(): Role | null {
    if (typeof window === 'undefined')
        return null;
    const pathRole = roleForPath(window.location.pathname);
    const fromLs = asFrontendRole(localStorage.getItem(ROLE_KEY));
    const fromCookie = asFrontendRole(readBrowserCookie(ROLE_KEY));
    const jwtRole = roleFromNestJwt(readBrowserCookie('ll_access'));

    // Mid intentional switch: Nest JWT already flipped, URL still on the old
    // dashboard. Trust the JWT — never rewrite role back to the old path (that
    // snapped users back / bounced middleware after deploy).
    if (pathRole && jwtRole && pathRole !== jwtRole) {
        return jwtRole;
    }
    // Stable dashboard: path wins so stale cookies cannot auto-flip roles.
    if (pathRole)
        return pathRole;

    // Off host/locum routes: cookie wins over drifted localStorage (middleware).
    if (fromLs && fromCookie && fromLs !== fromCookie)
        return fromCookie;
    if (fromLs)
        return fromLs;
    if (fromCookie)
        return fromCookie;
    return jwtRole;
}
export function saveEmail(email: string): void {
    if (typeof window === 'undefined')
        return;
    localStorage.setItem(EMAIL_KEY, email);
}
export function getEmail(): string | null {
    if (typeof window === 'undefined')
        return null;
    return localStorage.getItem(EMAIL_KEY);
}
const PROFILE_DONE_CLINIC = 'll_profile_done_clinic';
const PROFILE_DONE_LOCUM = 'll_profile_done_locum';
const PROFILE_DONE_LEGACY = 'll_profile_done';
function migrateLegacyProfileDone(): void {
    if (typeof window === 'undefined')
        return;
    if (localStorage.getItem(PROFILE_DONE_LEGACY) !== '1')
        return;
    const role = getRole();
    if (role === 'clinic' && localStorage.getItem(PROFILE_DONE_CLINIC) !== '1')
        localStorage.setItem(PROFILE_DONE_CLINIC, '1');
    if (role === 'locum' && localStorage.getItem(PROFILE_DONE_LOCUM) !== '1')
        localStorage.setItem(PROFILE_DONE_LOCUM, '1');
    localStorage.removeItem(PROFILE_DONE_LEGACY);
}
export function markProfileCompleteForRole(role: Role): void {
    if (typeof window === 'undefined')
        return;
    if (role === 'clinic')
        localStorage.setItem(PROFILE_DONE_CLINIC, '1');
    else
        localStorage.setItem(PROFILE_DONE_LOCUM, '1');
}
export function markProfileComplete(): void {
    if (typeof window === 'undefined')
        return;
    const role = getRole();
    if (role === 'clinic' || role === 'locum')
        markProfileCompleteForRole(role);
}
export function isProfileComplete(): boolean {
    if (typeof window === 'undefined')
        return false;
    migrateLegacyProfileDone();
    const role = getRole();
    if (role === 'clinic')
        return localStorage.getItem(PROFILE_DONE_CLINIC) === '1';
    if (role === 'locum')
        return localStorage.getItem(PROFILE_DONE_LOCUM) === '1';
    return false;
}
export function syncProfileCompleteCookies(): void {
    if (typeof window === 'undefined')
        return;
    migrateLegacyProfileDone();
    const clinicDone = localStorage.getItem(PROFILE_DONE_CLINIC) === '1';
    const locumDone = localStorage.getItem(PROFILE_DONE_LOCUM) === '1';
    if (clinicDone)
        setCookie('ll_profile_clinic', '1', 365);
    else
        deleteCookie('ll_profile_clinic');
    if (locumDone)
        setCookie('ll_profile_locum', '1', 365);
    else
        deleteCookie('ll_profile_locum');
    deleteCookie('ll_profile_complete');
}
export function clearProfileCompleteCookies(): void {
    deleteCookie('ll_profile_clinic');
    deleteCookie('ll_profile_locum');
    deleteCookie('ll_profile_complete');
}
export function saveLastPath(path: string, role?: Role | null): void {
    if (typeof window === 'undefined')
        return;
    if (!isStorableLastPath(path))
        return;
    const resolvedRole = role ?? roleForPath(path) ?? getRole();
    if (!resolvedRole)
        return;
    const pathRole = roleForPath(path);
    if (pathRole && pathRole !== resolvedRole)
        return;
    localStorage.setItem(lastPathStorageKey(resolvedRole), path);
    localStorage.removeItem(LAST_PATH_KEY);
}
export function popLastPath(role?: Role | null): string | null {
    if (typeof window === 'undefined')
        return null;
    const resolvedRole = role ?? getRole();
    if (!resolvedRole) {
        localStorage.removeItem(LAST_PATH_KEY);
        return null;
    }
    const key = lastPathStorageKey(resolvedRole);
    let path = localStorage.getItem(key);
    localStorage.removeItem(key);
    if (!path) {
        const legacy = localStorage.getItem(LAST_PATH_KEY);
        if (legacy && isStorableLastPath(legacy) && roleForPath(legacy) === resolvedRole)
            path = legacy;
        localStorage.removeItem(LAST_PATH_KEY);
    }
    return path;
}
export function clearLastPath(role?: Role | null): void {
    if (typeof window === 'undefined')
        return;
    if (role) {
        localStorage.removeItem(lastPathStorageKey(role));
        return;
    }
    localStorage.removeItem(LAST_PATH_KEY);
    localStorage.removeItem(LAST_PATH_KEY_CLINIC);
    localStorage.removeItem(LAST_PATH_KEY_LOCUM);
}
export function syncCookies(): void {
    if (typeof window === 'undefined')
        return;
    const token = getToken();
    const role = getRole();
    if (token)
        setCookie('ll_access', token, 365);
    if (role)
        setCookie(ROLE_KEY, role, 365);
    syncProfileCompleteCookies();
}
export function clearSession(): void {
    if (typeof window === 'undefined')
        return;
    [
        TOKEN_KEY_CLINIC,
        TOKEN_KEY_LOCUM,
        ROLE_KEY,
        EMAIL_KEY,
        LAST_PATH_KEY,
        LAST_PATH_KEY_CLINIC,
        LAST_PATH_KEY_LOCUM,
    ].forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(TOKEN_KEY_LEGACY);
    deleteCookie('ll_access');
    deleteCookie(ROLE_KEY);
}
export function clearAuth(): void {
    if (typeof window === 'undefined')
        return;
    clearSession();
    localStorage.removeItem(PROFILE_DONE_LEGACY);
    localStorage.removeItem(PROFILE_DONE_CLINIC);
    localStorage.removeItem(PROFILE_DONE_LOCUM);
    deleteCookie('ll_profile_complete');
    deleteCookie('ll_profile_clinic');
    deleteCookie('ll_profile_locum');
}
