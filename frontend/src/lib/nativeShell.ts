import { getAppOrigin } from '@/lib/appOrigin';

/** Must match `scheme` in mobile/app.json */
export const NATIVE_OAUTH_SCHEME = 'calocumlinkapp';

export type NativeShellInfo = {
  platform: string;
  pushToken: string | null;
};

declare global {
  interface Window {
    __LOCUMLINK_NATIVE__?: NativeShellInfo;
  }
}

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__LOCUMLINK_NATIVE__);
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

/** Map native OAuth return URL to the HTTPS callback the WebView should load (with PKCE cookies). */
export function webCallbackUrlFromOAuthResult(
  resultUrl: string,
  appOrigin: string,
): string | null {
  try {
    const parsed = new URL(resultUrl);
    const origin = appOrigin.replace(/\/$/, '');

    if (parsed.protocol === `${NATIVE_OAUTH_SCHEME}:`) {
      const target = new URL('/auth/callback', origin);
      const code = parsed.searchParams.get('code');
      const role = parsed.searchParams.get('role');
      const error =
        parsed.searchParams.get('error_description')
        ?? parsed.searchParams.get('error');
      if (code) target.searchParams.set('code', code);
      if (role) target.searchParams.set('role', role);
      if (error) target.searchParams.set('error', error);
      if (!code && !error) return null;
      return target.toString();
    }

    if (
      parsed.origin === new URL(origin).origin
      && parsed.pathname === '/auth/callback'
    ) {
      return parsed.toString();
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}
