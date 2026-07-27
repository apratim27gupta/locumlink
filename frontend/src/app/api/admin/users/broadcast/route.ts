import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Static path so this is not captured by `/api/admin/users/[id]`.
 * Proxies to Nest `POST /api/admin/users/broadcast`.
 */
export async function POST(req: Request) {
  const apiBase = (
    process.env.API_INTERNAL_URL ??
    process.env.NEST_INTERNAL_URL ??
    'http://127.0.0.1:3000'
  ).replace(/\/$/, '');

  const cookie = req.headers.get('cookie') ?? '';
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase}/api/admin/users/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body,
    });
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('[admin/users/broadcast POST]', err);
    return NextResponse.json(
      { error: 'Failed to reach messaging API' },
      { status: 502 },
    );
  }
}
