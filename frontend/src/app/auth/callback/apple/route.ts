import { NextRequest, NextResponse } from 'next/server';
import {
  APPLE_PENDING_COOKIE,
  APPLE_PENDING_MAX_AGE_SEC,
  encodeApplePendingPayload,
  type ApplePendingPayload,
} from '@/lib/applePendingAuth';
import { getAppOrigin } from '@/lib/appOrigin';

function redirectToAuth(error: string): NextResponse {
  const signInUrl = new URL('/auth', getAppOrigin());
  signInUrl.searchParams.set('mode', 'signin');
  signInUrl.searchParams.set('error', error);
  return NextResponse.redirect(signInUrl);
}

function redirectToComplete(payload: {
  id_token: string;
  code?: string;
  user?: unknown;
}): NextResponse {
  const completeUrl = new URL('/auth/callback/complete', getAppOrigin());
  completeUrl.searchParams.set('provider', 'apple');

  const response = NextResponse.redirect(completeUrl);
  response.cookies.set(
    APPLE_PENDING_COOKIE,
    encodeApplePendingPayload({
      id_token: payload.id_token,
      code: payload.code,
      user: payload.user as ApplePendingPayload['user'],
    }),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: APPLE_PENDING_MAX_AGE_SEC,
      path: '/',
    },
  );
  return response;
}

/** Apple Sign in with Apple JS (form_post) lands here when usePopup is false. */
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

  return redirectToComplete({
    id_token: idToken,
    code: code || undefined,
    user,
  });
}
