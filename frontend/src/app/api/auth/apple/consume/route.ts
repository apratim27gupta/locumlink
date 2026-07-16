import { NextRequest, NextResponse } from 'next/server';
import {
  APPLE_PENDING_COOKIE,
  decodeApplePendingPayload,
} from '@/lib/applePendingAuth';

/** Read and clear the pending Apple sign-in cookie (native auth session → WebView handoff). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.cookies.get(APPLE_PENDING_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const payload = decodeApplePendingPayload(raw);
  if (!payload) {
    const response = NextResponse.json({ ok: false }, { status: 400 });
    response.cookies.delete(APPLE_PENDING_COOKIE);
    return response;
  }

  const response = NextResponse.json({ ok: true, ...payload });
  response.cookies.delete(APPLE_PENDING_COOKIE);
  return response;
}
