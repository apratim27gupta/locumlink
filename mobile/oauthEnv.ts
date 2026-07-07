/** Production host — Supabase Site URL; may receive misdirected staging OAuth callbacks. */
export const PROD_HOST = 'locumlink.ca';

/** Web origin this mobile shell wraps — set per build via EXPO_PUBLIC_APP_URL. */
export const APP_ORIGIN = (
  process.env.EXPO_PUBLIC_APP_URL ?? 'https://staging.locumlink.ca'
).replace(/\/$/, '');

export const APP_HOST = new URL(APP_ORIGIN).hostname;

/** Must match `scheme` in app.config.js and frontend `nativeShell.ts`. */
export const NATIVE_OAUTH_SCHEME = 'calocumlinkapp';

export const NATIVE_OAUTH_RETURN_URL = `${NATIVE_OAUTH_SCHEME}://auth/callback`;

/** Staging-only: Supabase Site URL fallback lands on prod — listen for that in the system browser. */
export function getOAuthBrowserReturnUrl(): string {
  if (APP_HOST === 'staging.locumlink.ca') {
    return `https://${PROD_HOST}/auth/callback`;
  }
  if (APP_HOST === PROD_HOST) {
    return `https://${PROD_HOST}/auth/callback`;
  }
  return NATIVE_OAUTH_RETURN_URL;
}

export function isNativeOAuthCallbackUrl(url: string): boolean {
  return url.startsWith(`${NATIVE_OAUTH_SCHEME}://auth/callback`);
}

/**
 * Staging may receive prod HTTPS callbacks when Supabase uses Site URL instead of calocumlinkapp.
 * Prod builds never accept staging callbacks.
 */
function isAllowedMisdirectedCallback(host: string): boolean {
  return APP_HOST === 'staging.locumlink.ca' && host === PROD_HOST;
}

/** True only for this app's custom scheme or allowed HTTPS callback hosts. */
export function isOAuthCallbackForThisApp(url: string): boolean {
  if (isNativeOAuthCallbackUrl(url)) return true;

  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '/auth/callback') return false;
    if (parsed.hostname === APP_HOST) return true;
    return isAllowedMisdirectedCallback(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Map an OAuth return URL into the HTTPS callback for this app's WebView.
 * Native scheme → APP_ORIGIN; matching HTTPS host → unchanged; other hosts → null.
 */
export function toWebOAuthCallbackUrl(resultUrl: string): string | null {
  if (!isOAuthCallbackForThisApp(resultUrl)) return null;

  try {
    const parsed = new URL(resultUrl);
    const code = parsed.searchParams.get('code');
    const role = parsed.searchParams.get('role');
    const error =
      parsed.searchParams.get('error_description')
      ?? parsed.searchParams.get('error');
    if (!code && !error) return null;

    if (!isNativeOAuthCallbackUrl(resultUrl) && parsed.origin === new URL(APP_ORIGIN).origin) {
      return parsed.toString();
    }

    const target = new URL('/auth/callback', APP_ORIGIN);
    if (code) target.searchParams.set('code', code);
    if (role) target.searchParams.set('role', role);
    if (error) target.searchParams.set('error', error);
    return target.toString();
  } catch {
    return null;
  }
}

/** Block WebView navigation to another environment's OAuth callback (never block allowed misdirects). */
export function isForeignOAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '/auth/callback') return false;
    if (!parsed.protocol.startsWith('http')) return false;
    if (parsed.hostname === APP_HOST) return false;
    if (isAllowedMisdirectedCallback(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
