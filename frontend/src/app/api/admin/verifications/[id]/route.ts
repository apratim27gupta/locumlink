import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import {
  fetchHostVerificationDetail,
  fetchLocumVerificationDetail,
} from '@/lib/admin-verification-detail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const profileType = new URL(req.url).searchParams.get('profileType');

  try {
    const db = getDb();
    const detail =
      profileType === 'host'
        ? await fetchHostVerificationDetail(db, id)
        : await fetchLocumVerificationDetail(db, id);

    if (!detail) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error('[admin/verifications GET]', err);
    const message =
      err instanceof Error ? err.message : 'Failed to load verification details';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    verificationStatus: 'VERIFIED' | 'REJECTED';
    notes?: string;
    profileType?: 'locum' | 'host';
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { verificationStatus, notes, profileType } = body;

  if (verificationStatus !== 'VERIFIED' && verificationStatus !== 'REJECTED') {
    return NextResponse.json(
      { error: 'verificationStatus must be VERIFIED or REJECTED' },
      { status: 400 },
    );
  }

  const db = getDb();
  const verifiedAt = verificationStatus === 'VERIFIED' ? new Date() : null;

  if (profileType === 'host') {
    const existing = await db.hostProfile.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Host profile not found' }, { status: 404 });
    }

    const updated = await db.hostProfile.update({
      where: { id },
      data: {
        cpsnsVerificationStatus: verificationStatus,
        cpsnsVerifiedAt: verifiedAt,
      },
      include: { user: { select: { email: true, id: true } } },
    });

    await db.auditLog.create({
      data: {
        adminActorId: session.adminId ?? undefined,
        subjectId: updated.userId,
        action: 'STATUS_CHANGE',
        entity: 'HostProfile',
        entityId: id,
        before: { cpsnsVerificationStatus: existing.cpsnsVerificationStatus },
        after: { cpsnsVerificationStatus: verificationStatus, notes: notes ?? null },
        endpoint: `/api/admin/verifications/${id}`,
      },
    });

    return NextResponse.json({
      ok: true,
      verificationStatus: updated.cpsnsVerificationStatus,
    });
  }

  const existing = await db.locumProfile.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Locum profile not found' }, { status: 404 });
  }

  const updated = await db.locumProfile.update({
    where: { id },
    data: {
      verificationStatus,
      verifiedAt,
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
      before: { verificationStatus: existing.verificationStatus },
      after: { verificationStatus, notes: notes ?? null },
      endpoint: `/api/admin/verifications/${id}`,
    },
  });

  return NextResponse.json({ ok: true, verificationStatus });
}
