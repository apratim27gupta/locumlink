import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

import { getAppOrigin } from '@/lib/appOrigin';

/** True when the request comes from an embedded native WebView (PKCE in localStorage). */
function isNativeWebView(request: NextRequest): boolean {
  return /\bwv\b/i.test(request.headers.get('user-agent') ?? '');
}

/** PKCE verifier cookie — present in desktop browsers; WebView may use localStorage instead. */
function requestHasPkceVerifier(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) =>
    /code-verifier|code_verifier/i.test(cookie.name),
  );
}

function isPkceVerifierError(message: string): boolean {
  return /PKCE|verifier/i.test(message);
}

function getNativeReturnUrl(requestUrl: URL): URL | null {
  const value = requestUrl.searchParams.get('native_return');
  if (!value) return null;

  try {
    const url = new URL(value);
    const isExpoGo = url.protocol === 'exp:' && url.pathname.includes('/auth/callback');
    const isStandaloneApp =
      url.protocol === 'calocumlinkapp:' &&
      url.hostname === 'auth' &&
      url.pathname === '/callback';

    if (!isExpoGo && !isStandaloneApp) return null;
    return url;
  } catch {
    return null;
  }
}

function redirectToNativeShell(requestUrl: URL): NextResponse | null {
  const nativeReturn = getNativeReturnUrl(requestUrl);
  if (!nativeReturn) return null;

  const code = requestUrl.searchParams.get('code');
  const role = requestUrl.searchParams.get('role');
  const error =
    requestUrl.searchParams.get('error_description') ??
    requestUrl.searchParams.get('error');

  if (code) nativeReturn.searchParams.set('code', code);
  if (role) nativeReturn.searchParams.set('role', role);
  if (error) nativeReturn.searchParams.set('error', error);

  // JS navigation handles custom schemes more reliably than HTTP 307 from HTTPS.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signing in</title>
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:2rem;color:#374151">
  <p>Returning to Locum Link…</p>
  <script>window.location.replace(${JSON.stringify(nativeReturn.toString())});</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** Fallback page if the native return URL is unavailable. */
function deferToNativeShell(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signing in</title>
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:2rem;color:#374151">
  <p>Returning to Locum Link…</p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error_description');
  const origin = getAppOrigin();

  if (error) {
    const nativeRedirect = redirectToNativeShell(requestUrl);
    if (nativeRedirect) return nativeRedirect;

    const signInUrl = new URL('/auth', origin);
    signInUrl.searchParams.set('mode', 'signin');
    signInUrl.searchParams.set('error', error);
    return NextResponse.redirect(signInUrl);
  }

  if (code) {
    if (!requestHasPkceVerifier(request)) {
      if (isNativeWebView(request)) {
        const role = requestUrl.searchParams.get('role') ?? 'locum';
        const completeUrl = new URL('/auth/callback/complete', origin);
        completeUrl.searchParams.set('role', role);
        completeUrl.searchParams.set('code', code);
        return NextResponse.redirect(completeUrl);
      }
      const nativeRedirect = redirectToNativeShell(requestUrl);
      if (nativeRedirect) return nativeRedirect;
      return deferToNativeShell();
    }

    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      if (isPkceVerifierError(exchangeError.message)) {
        if (isNativeWebView(request)) {
          const role = requestUrl.searchParams.get('role') ?? 'locum';
          const completeUrl = new URL('/auth/callback/complete', origin);
          completeUrl.searchParams.set('role', role);
          completeUrl.searchParams.set('code', code);
          return NextResponse.redirect(completeUrl);
        }
        const nativeRedirect = redirectToNativeShell(requestUrl);
        if (nativeRedirect) return nativeRedirect;
        return deferToNativeShell();
      }
      const signInUrl = new URL('/auth', origin);
      signInUrl.searchParams.set('mode', 'signin');
      signInUrl.searchParams.set('error', exchangeError.message);
      return NextResponse.redirect(signInUrl);
    }
  }

  const role = requestUrl.searchParams.get('role') ?? 'locum';
  const completeUrl = new URL('/auth/callback/complete', origin);
  completeUrl.searchParams.set('role', role);
  return NextResponse.redirect(completeUrl);
}
