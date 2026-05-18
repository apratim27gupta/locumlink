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

  let body: { verificationStatus: 'VERIFIED' | 'REJECTED'; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { verificationStatus, notes } = body;

  if (verificationStatus !== 'VERIFIED' && verificationStatus !== 'REJECTED') {
    return NextResponse.json(
      { error: 'verificationStatus must be VERIFIED or REJECTED' },
      { status: 400 },
    );
  }

  const db = getDb();

  const updated = await db.locumProfile.update({
    where: { id },
    data: {
      verificationStatus,
      verifiedAt: verificationStatus === 'VERIFIED' ? new Date() : null,
    },
    include: { user: { select: { email: true, id: true } } },
  });

  if (verificationStatus === 'VERIFIED') {
    await db.user.update({
      where: { id: updated.userId },
      data: { status: 'ACTIVE' },
    });
  }

  await db.auditLog.create({
    data: {
      adminActorId: session.adminId ?? undefined,
      subjectId: updated.userId,
      action: 'STATUS_CHANGE',
      entity: 'LocumProfile',
      entityId: id,
      before: { verificationStatus: 'PENDING_REVIEW' },
      after: { verificationStatus, notes: notes ?? null },
      endpoint: `/api/admin/verifications/${id}`,
    },
  });

  return NextResponse.json({ ok: true, verificationStatus });
}
