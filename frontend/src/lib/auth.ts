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
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax`;
}
function deleteCookie(name: string): void {
    if (typeof document === 'undefined')
        return;
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
export function saveToken(token: string): void {
    if (typeof window === 'undefined')
        return;
    const role = getRole();
    const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
    localStorage.setItem(key, token);
    setCookie('ll_access', token, 365);
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
    return localStorage.getItem(ROLE_KEY) as Role | null;
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
export function markProfileComplete(): void {
    if (typeof window === 'undefined')
        return;
    const role = getRole();
    if (role === 'clinic')
        localStorage.setItem(PROFILE_DONE_CLINIC, '1');
    else if (role === 'locum')
        localStorage.setItem(PROFILE_DONE_LOCUM, '1');
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
