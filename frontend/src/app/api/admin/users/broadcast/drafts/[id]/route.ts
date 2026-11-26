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

function target(id: string): string {
  return `${apiBase()}/api/admin/users/broadcast/drafts/${encodeURIComponent(id)}`;
}

/** Update one broadcast draft. Proxies to Nest. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const cookie = req.headers.get('cookie') ?? '';
  const body = await req.text();
  try {
    const res = await fetch(target(id), {
      method: 'PATCH',
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
    console.error('[admin/users/broadcast/drafts/:id PATCH]', err);
    return NextResponse.json({ error: 'Failed to reach API' }, { status: 502 });
  }
}

/** Delete one broadcast draft. Proxies to Nest. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const cookie = req.headers.get('cookie') ?? '';
  try {
    const res = await fetch(target(id), {
      method: 'DELETE',
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
    console.error('[admin/users/broadcast/drafts/:id DELETE]', err);
    return NextResponse.json({ error: 'Failed to reach API' }, { status: 502 });
  }
}
