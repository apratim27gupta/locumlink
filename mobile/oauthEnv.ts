/** Production host — Supabase Site URL fallback during staging OAuth. */
export const PROD_HOST = 'locumlink.ca';

/** Web origin this mobile shell wraps — set per build via EXPO_PUBLIC_APP_URL. */
export const APP_ORIGIN = (
  process.env.EXPO_PUBLIC_APP_URL ?? 'https://staging.locumlink.ca'
).replace(/\/$/, '');

export const APP_HOST = new URL(APP_ORIGIN).hostname;

/** Must match `scheme` in app.config.js and frontend `nativeShell.ts`. */
export const NATIVE_OAUTH_SCHEME = 'calocumlinkapp';

export const NATIVE_OAUTH_RETURN_URL = `${NATIVE_OAUTH_SCHEME}://auth/callback`;

/**
 * URL the system browser session waits for after OAuth.
 * Standalone builds use the custom scheme (matches Supabase redirectTo in native shell).
 * Misdirected HTTPS callbacks are still handled via Linking / universal links.
 */
export function getOAuthBrowserReturnUrl(): string {
  return NATIVE_OAUTH_RETURN_URL;
}

export function isNativeOAuthCallbackUrl(url: string): boolean {
  return url.startsWith(`${NATIVE_OAUTH_SCHEME}://auth/callback`);
}

/** Expo Go deep link — exp://host:port/--/auth/callback */
export function isExpoDevOAuthCallbackUrl(url: string): boolean {
  if (!url.startsWith('exp://')) return false;
  try {
    return new URL(url).pathname.includes('/auth/callback');
  } catch {
    return url.includes('/auth/callback');
  }
}

function isAppOwnedOAuthCallbackUrl(url: string): boolean {
  return isNativeOAuthCallbackUrl(url) || isExpoDevOAuthCallbackUrl(url);
}

export function isOAuthStartUrl(url: string): boolean {
  return (
    url.includes('supabase.co/auth/v1/authorize')
    || url.includes('accounts.google.com')
    || url.includes('login.microsoftonline.com')
    || url.includes('appleid.apple.com')
  );
}

/** Staging may receive prod HTTPS callbacks when Supabase uses Site URL instead of calocumlinkapp. */
function isAllowedMisdirectedCallback(host: string): boolean {
  return APP_HOST === 'staging.locumlink.ca' && host === PROD_HOST;
}

export function isOAuthCallbackForThisApp(url: string): boolean {
  if (isAppOwnedOAuthCallbackUrl(url)) return true;

  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '/auth/callback') return false;
    if (parsed.hostname === APP_HOST) return true;
    return isAllowedMisdirectedCallback(parsed.hostname);
  } catch {
    return false;
  }
}

/** Map OAuth return URL into the HTTPS callback for this app's WebView (PKCE cookies live there). */
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

    if (!isAppOwnedOAuthCallbackUrl(resultUrl) && parsed.origin === new URL(APP_ORIGIN).origin) {
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
