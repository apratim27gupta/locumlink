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

/** List the current admin's broadcast drafts. Proxies to Nest. */
export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') ?? '';
  try {
    const res = await fetch(`${apiBase()}/api/admin/users/broadcast/drafts`, {
      method: 'GET',
      headers: { ...(cookie ? { cookie } : {}) },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[admin/users/broadcast/drafts GET]', err);
    return NextResponse.json({ error: 'Failed to reach API' }, { status: 502 });
  }
}

/** Create a new broadcast draft. Proxies to Nest. */
export async function POST(req: Request) {
  const cookie = req.headers.get('cookie') ?? '';
  const body = await req.text();
  try {
    const res = await fetch(`${apiBase()}/api/admin/users/broadcast/drafts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[admin/users/broadcast/drafts POST]', err);
    return NextResponse.json({ error: 'Failed to reach API' }, { status: 502 });
  }
}
