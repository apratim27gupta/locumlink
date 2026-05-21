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

  if (profileType !== 'locum' && profileType !== 'host') {
    return NextResponse.json(
      { error: 'profileType query must be locum or host' },
      { status: 400 },
    );
  }

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
    cpsnsVerificationStatus: 'VERIFIED' | 'REJECTED';
    rejectionReason?: string;
    notes?: string;
    profileType?: 'locum' | 'host';
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { cpsnsVerificationStatus, profileType } = body;
  const rejectionReason = (body.rejectionReason ?? body.notes ?? '').trim();

  if (
    cpsnsVerificationStatus !== 'VERIFIED'
    && cpsnsVerificationStatus !== 'REJECTED'
  ) {
    return NextResponse.json(
      { error: 'cpsnsVerificationStatus must be VERIFIED or REJECTED' },
      { status: 400 },
    );
  }

  if (cpsnsVerificationStatus === 'REJECTED' && !rejectionReason) {
    return NextResponse.json(
      {
        error:
          'Rejection reason is required when rejecting a credential submission.',
      },
      { status: 400 },
    );
  }

  const db = getDb();
  const cpsnsVerifiedAt =
    cpsnsVerificationStatus === 'VERIFIED' ? new Date() : null;

  if (profileType === 'host') {
    const existing = await db.hostProfile.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Host profile not found' }, { status: 404 });
    }

    const updated = await db.hostProfile.update({
      where: { id },
      data: {
        cpsnsVerificationStatus,
        cpsnsVerifiedAt,
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
        outcome: 'SUCCESS',
        actorRole: 'admin',
        before: { cpsnsVerificationStatus: existing.cpsnsVerificationStatus },
        after: {
          cpsnsVerificationStatus,
          rejectionReason: rejectionReason || null,
        },
        endpoint: `/api/admin/verifications/${id}`,
      },
    });

    return NextResponse.json({
      ok: true,
      cpsnsVerificationStatus: updated.cpsnsVerificationStatus,
    });
  }

  const existing = await db.locumProfile.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Locum profile not found' }, { status: 404 });
  }

  const updated = await db.locumProfile.update({
    where: { id },
    data: {
      cpsnsVerificationStatus,
      cpsnsVerifiedAt,
      rejectionReason:
        cpsnsVerificationStatus === 'REJECTED' ? rejectionReason : null,
      rejectedAt: cpsnsVerificationStatus === 'REJECTED' ? new Date() : null,
    },
    include: { user: { select: { email: true, id: true } } },
  });

  if (cpsnsVerificationStatus === 'VERIFIED') {
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
      outcome: 'SUCCESS',
      actorRole: 'admin',
      before: { cpsnsVerificationStatus: existing.cpsnsVerificationStatus },
      after: {
        cpsnsVerificationStatus,
        rejectionReason: rejectionReason || null,
      },
      endpoint: `/api/admin/verifications/${id}`,
    },
  });

  return NextResponse.json({ ok: true, cpsnsVerificationStatus });
}
