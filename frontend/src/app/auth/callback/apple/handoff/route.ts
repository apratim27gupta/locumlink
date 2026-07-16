import { NextResponse } from 'next/server';
import { getAppOrigin } from '@/lib/appOrigin';

const completeUrl = `${getAppOrigin()}/auth/callback/complete?provider=apple`;

/** After Apple form_post — auth session closes here; WebView completes sign-in separately. */
export async function GET(): Promise<NextResponse> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Returning to Locum Link</title>
  <script>
    (function () {
      var ua = navigator.userAgent || '';
      var isAppWebView =
        /LocumLinkNative/i.test(ua)
        || (window.__LOCUMLINK_NATIVE__ != null)
        || (window.ReactNativeWebView && window.ReactNativeWebView.postMessage);
      var isDesktop = !/iPhone|iPad|iPod|Android/i.test(ua);
      if (isAppWebView || isDesktop) {
        window.location.replace(${JSON.stringify(completeUrl)});
      }
    })();
  </script>
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:2rem;color:#374151">
  <p>Returning to Locum Link…</p>
  <p style="font-size:14px;color:#6B7280">You can close this window.</p>
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
