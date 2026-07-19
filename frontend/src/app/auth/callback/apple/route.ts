import { NextRequest, NextResponse } from 'next/server';
import { getAppOrigin } from '@/lib/appOrigin';

const APPLE_JS_RESPONSE_KEY = 'll_apple_js_response';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function redirectToAuth(error: string): NextResponse {
  const signInUrl = new URL('/auth', getAppOrigin());
  signInUrl.searchParams.set('mode', 'signin');
  signInUrl.searchParams.set('error', error);
  return NextResponse.redirect(signInUrl);
}

/** Apple Sign in with Apple JS (form_post) lands here when usePopup is false (WebView). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectToAuth('Apple sign-in could not be completed.');
  }

  const error =
    formData.get('error')?.toString()
    ?? formData.get('error_description')?.toString()
    ?? '';
  if (error) {
    return redirectToAuth(error);
  }

  const idToken = formData.get('id_token')?.toString() ?? '';
  if (!idToken) {
    return redirectToAuth('Apple did not return a sign-in token.');
  }

  const code = formData.get('code')?.toString() ?? '';
  const userRaw = formData.get('user')?.toString() ?? '';
  let user: unknown = null;
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      user = null;
    }
  }

  const payload = JSON.stringify({
    id_token: idToken,
    code: code || undefined,
    user,
  });

  const completeUrl = new URL('/auth/callback/complete', getAppOrigin());
  completeUrl.searchParams.set('provider', 'apple');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signing in with Apple</title>
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:2rem;color:#374151">
  <p>Completing Apple sign-in…</p>
  <script>
    try {
      sessionStorage.setItem(${JSON.stringify(APPLE_JS_RESPONSE_KEY)}, ${JSON.stringify(payload)});
      window.location.replace(${JSON.stringify(completeUrl.toString())});
    } catch (e) {
      window.location.replace(${JSON.stringify(
        new URL('/auth?mode=signin&error=Could+not+complete+Apple+sign-in', getAppOrigin()).toString(),
      )});
    }
  </script>
  <noscript>
    <p>JavaScript is required to finish signing in.</p>
    <a href="${escapeHtml(completeUrl.toString())}">Continue</a>
  </noscript>
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
