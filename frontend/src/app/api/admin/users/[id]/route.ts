import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: {
    status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
    suspensionNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { status } = body;
  const suspensionNote = body.suspensionNote?.trim() ?? '';
  const allowed = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
  if (!allowed.includes(status as (typeof allowed)[number])) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
  }

  if (status === 'SUSPENDED' && !suspensionNote) {
    return NextResponse.json(
      { error: 'Suspension note is required when suspending a user.' },
      { status: 400 },
    );
  }

  const db = getDb();

  const target = await db.user.findUnique({
    where: { id },
    select: { role: true, status: true },
  });

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (target.role === 'ADMIN') {
    return NextResponse.json({ error: 'Cannot modify admin accounts' }, { status: 403 });
  }

  const updated = await db.user.update({
    where: { id },
    data:
      status === 'SUSPENDED'
        ? {
            status,
            suspensionNote,
            suspendedAt: new Date(),
          }
        : status === 'ACTIVE'
          ? {
              status,
              suspensionNote: null,
              suspendedAt: null,
            }
          : { status },
    select: { id: true, email: true, status: true },
  });

  await db.auditLog.create({
    data: {
      adminActorId: session.adminId ?? undefined,
      subjectId: id,
      action: 'STATUS_CHANGE',
      entity: 'User',
      entityId: id,
      outcome: 'SUCCESS',
      actorRole: 'admin',
      before: { status: target.status },
      after: {
        status,
        ...(status === 'SUSPENDED' ? { suspensionNote } : {}),
      },
      endpoint: `/api/admin/users/${id}`,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}
