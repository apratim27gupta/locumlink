export type Role = 'clinic' | 'locum';

const TOKEN_KEY_CLINIC = 'll_access_clinic';
const TOKEN_KEY_LOCUM = 'll_access_locum';
const TOKEN_KEY_LEGACY = 'll_access';
const ROLE_KEY = 'll_role';
const EMAIL_KEY = 'll_email';
const LAST_PATH_KEY = 'll_last_path';

// ── Cookie helpers ────────────────────────────────────────────────────────────

function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// ── Token ─────────────────────────────────────────────────────────────────────

export function saveToken(token: string): void {
  if (typeof window === 'undefined') return;
  const role = getRole();
  const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
  localStorage.setItem(key, token);
  setCookie('ll_access', token, 365); // ← 365 days — outlives any JWT
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;

  const role = getRole();

  if (role) {
    const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
    const v = localStorage.getItem(key);
    if (v) return v;
  } else {
    // Role missing — try both keys
    const clinic = localStorage.getItem(TOKEN_KEY_CLINIC);
    if (clinic) return clinic;
    const locum = localStorage.getItem(TOKEN_KEY_LOCUM);
    if (locum) return locum;
  }

  // Fallback legacy
  const legacy = localStorage.getItem(TOKEN_KEY_LEGACY);
  if (legacy) {
    const key = role === 'clinic' ? TOKEN_KEY_CLINIC : TOKEN_KEY_LOCUM;
    if (key) localStorage.setItem(key, legacy);
    return legacy;
  }

  return null;
}

// ── Role ──────────────────────────────────────────────────────────────────────

export function saveRole(role: Role): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ROLE_KEY, role);
  setCookie(ROLE_KEY, role, 365); // ← 365 days
}

export function getRole(): Role | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ROLE_KEY) as Role | null;
}

// ── Email ─────────────────────────────────────────────────────────────────────

export function saveEmail(email: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EMAIL_KEY, email);
}

export function getEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(EMAIL_KEY);
}

// ── Profile complete ──────────────────────────────────────────────────────────

const PROFILE_DONE_CLINIC = 'll_profile_done_clinic';
const PROFILE_DONE_LOCUM = 'll_profile_done_locum';
const PROFILE_DONE_LEGACY = 'll_profile_done';

function migrateLegacyProfileDone(): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(PROFILE_DONE_LEGACY) !== '1') return;
  const role = getRole();
  if (role === 'clinic' && localStorage.getItem(PROFILE_DONE_CLINIC) !== '1')
    localStorage.setItem(PROFILE_DONE_CLINIC, '1');
  if (role === 'locum' && localStorage.getItem(PROFILE_DONE_LOCUM) !== '1')
    localStorage.setItem(PROFILE_DONE_LOCUM, '1');
  localStorage.removeItem(PROFILE_DONE_LEGACY);
}

export function markProfileComplete(): void {
  if (typeof window === 'undefined') return;
  const role = getRole();
  if (role === 'clinic') localStorage.setItem(PROFILE_DONE_CLINIC, '1');
  else if (role === 'locum') localStorage.setItem(PROFILE_DONE_LOCUM, '1');
}

export function isProfileComplete(): boolean {
  if (typeof window === 'undefined') return false;
  migrateLegacyProfileDone();
  const role = getRole();
  if (role === 'clinic')
    return localStorage.getItem(PROFILE_DONE_CLINIC) === '1';
  if (role === 'locum') return localStorage.getItem(PROFILE_DONE_LOCUM) === '1';
  return false;
}

export function syncProfileCompleteCookies(): void {
  if (typeof window === 'undefined') return;
  migrateLegacyProfileDone();
  const clinicDone = localStorage.getItem(PROFILE_DONE_CLINIC) === '1';
  const locumDone = localStorage.getItem(PROFILE_DONE_LOCUM) === '1';
  if (clinicDone) setCookie('ll_profile_clinic', '1', 365);
  else deleteCookie('ll_profile_clinic');
  if (locumDone) setCookie('ll_profile_locum', '1', 365);
  else deleteCookie('ll_profile_locum');
  deleteCookie('ll_profile_complete');
}

export function clearProfileCompleteCookies(): void {
  deleteCookie('ll_profile_clinic');
  deleteCookie('ll_profile_locum');
  deleteCookie('ll_profile_complete');
}

// ── Last visited path ─────────────────────────────────────────────────────────

export function saveLastPath(path: string): void {
  if (typeof window === 'undefined') return;
  if (path === '/' || path.startsWith('/auth') || path.startsWith('/home'))
    return;
  localStorage.setItem(LAST_PATH_KEY, path);
}

export function popLastPath(): string | null {
  if (typeof window === 'undefined') return null;
  const path = localStorage.getItem(LAST_PATH_KEY);
  localStorage.removeItem(LAST_PATH_KEY);
  return path;
}

export function clearLastPath(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LAST_PATH_KEY);
}

// ── Re-sync cookies ───────────────────────────────────────────────────────────
// Call this on mount and on tab focus so the middleware never sees a missing cookie

export function syncCookies(): void {
  if (typeof window === 'undefined') return;
  const token = getToken();
  const role = getRole();
  if (token) setCookie('ll_access', token, 365); // ← always 365
  if (role) setCookie(ROLE_KEY, role, 365); // ← always 365
  syncProfileCompleteCookies();
}

// ── Clear session (401) ───────────────────────────────────────────────────────

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  [
    TOKEN_KEY_CLINIC,
    TOKEN_KEY_LOCUM,
    ROLE_KEY,
    EMAIL_KEY,
    LAST_PATH_KEY,
  ].forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(TOKEN_KEY_LEGACY);
  deleteCookie('ll_access');
  deleteCookie(ROLE_KEY);
}

// ── Full sign-out ─────────────────────────────────────────────────────────────

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  clearSession();
  localStorage.removeItem(PROFILE_DONE_LEGACY);
  localStorage.removeItem(PROFILE_DONE_CLINIC);
  localStorage.removeItem(PROFILE_DONE_LOCUM);
  deleteCookie('ll_profile_complete');
  deleteCookie('ll_profile_clinic');
  deleteCookie('ll_profile_locum');
}
