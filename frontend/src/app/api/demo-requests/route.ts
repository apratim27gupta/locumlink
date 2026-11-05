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

/** Proxies public demo requests to Nest (avoids Next rewrite 404 on staging). */
export async function POST(req: Request) {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/demo-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('[demo-requests POST]', err);
    return NextResponse.json(
      { message: 'Failed to reach demo request API' },
      { status: 502 },
    );
  }
}
