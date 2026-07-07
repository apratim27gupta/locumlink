import { getAppOrigin } from '@/lib/appOrigin';

/** Must match `scheme` in mobile/app.json */
export const NATIVE_OAUTH_SCHEME = 'calocumlinkapp';

export type NativeShellInfo = {
  platform: string;
  pushToken: string | null;
  appOrigin?: string;
};

declare global {
  interface Window {
    __LOCUMLINK_NATIVE__?: NativeShellInfo;
  }
}

export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__LOCUMLINK_NATIVE__) return true;
  // Fallback when inject runs late — Android/iOS WebView user agents include "; wv)".
  return /\bwv\b/i.test(navigator.userAgent);
}

export function getNativePushToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.__LOCUMLINK_NATIVE__?.pushToken ?? null;
}

export function getNativePlatform(): 'ios' | 'android' | null {
  if (typeof window === 'undefined') return null;
  const platform = window.__LOCUMLINK_NATIVE__?.platform;
  if (platform === 'ios' || platform === 'android') return platform;
  return null;
}

/** OAuth return URL for Supabase — custom scheme so the system browser never hits our HTTPS callback (PKCE cookies live in the WebView). */
export function getNativeOAuthCallbackBase(): string {
  return `${NATIVE_OAUTH_SCHEME}://auth/callback`;
}

export function getOAuthCallbackRedirect(role: string): string {
  const roleParam = `role=${encodeURIComponent(role)}`;
  if (isNativeShell()) {
    return `${getNativeOAuthCallbackBase()}?${roleParam}`;
  }
  return `${getAppOrigin()}/auth/callback?${roleParam}`;
}

function isAllowedMisdirectedCallback(host: string, appHost: string): boolean {
  return appHost === 'staging.locumlink.ca' && host === 'locumlink.ca';
}

/** Map OAuth return URL to the HTTPS callback for this environment's WebView. */
export function webCallbackUrlFromOAuthResult(
  resultUrl: string,
  appOrigin: string,
): string | null {
  const origin = (appOrigin || getAppOrigin()).replace(/\/$/, '');
  const appHost = new URL(origin).hostname;
  const isNative = resultUrl.startsWith(`${NATIVE_OAUTH_SCHEME}://auth/callback`);

  try {
    const parsed = new URL(resultUrl);

    if (isNative) {
      // custom scheme — always for this install
    } else if (parsed.pathname !== '/auth/callback') {
      return null;
    } else if (parsed.hostname !== appHost && !isAllowedMisdirectedCallback(parsed.hostname, appHost)) {
      return null;
    }

    const code = parsed.searchParams.get('code');
    const role = parsed.searchParams.get('role');
    const error =
      parsed.searchParams.get('error_description')
      ?? parsed.searchParams.get('error');
    if (!code && !error) return null;

    if (!isNative && parsed.origin === new URL(origin).origin) {
      return parsed.toString();
    }

    const target = new URL('/auth/callback', origin);
    if (code) target.searchParams.set('code', code);
    if (role) target.searchParams.set('role', role);
    if (error) target.searchParams.set('error', error);
    return target.toString();
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}
