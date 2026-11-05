import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function apiBase(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEST_INTERNAL_URL ??
    'http://127.0.0.1:3000'
  ).replace(/\/$/, '');
}

/** Proxies admin demo-request list to Nest. */
export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') ?? '';
  const authorization = req.headers.get('authorization') ?? '';

  try {
    const res = await fetch(`${apiBase()}/api/admin/demo-requests`, {
      method: 'GET',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(authorization ? { authorization } : {}),
      },
      cache: 'no-store',
    });
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('[admin/demo-requests GET]', err);
    return NextResponse.json(
      { message: 'Failed to reach demo request API' },
      { status: 502 },
    );
  }
}
