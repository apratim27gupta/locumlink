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

/** Keep the callback URL intact so openAuthSessionAsync can return to the native shell. */
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
