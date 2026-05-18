import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';

  const db = getDb();

  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    where: {
      role: { not: 'ADMIN' },
      ...(q ? { email: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      locumProfile: {
        select: {
          firstName: true,
          lastName: true,
          cpsnsId: true,
          verificationStatus: true,
        },
      },
      hostProfile: {
        select: {
          practiceName: true,
          city: true,
          province: true,
        },
      },
    },
  });

  const header = [
    'ID', 'Email', 'Role', 'Status',
    'Name / Clinic', 'CPSNS / City', 'Verification',
    'Joined', 'Last Login',
  ];

  const rows = users.map((u) => {
    const nameOrClinic =
      u.role === 'LOCUM'
        ? [u.locumProfile?.firstName, u.locumProfile?.lastName].filter(Boolean).join(' ')
        : u.hostProfile?.practiceName ?? '';
    const cpsnsOrCity =
      u.role === 'LOCUM'
        ? u.locumProfile?.cpsnsId ?? ''
        : `${u.hostProfile?.city ?? ''}, ${u.hostProfile?.province ?? ''}`.replace(/^, |, $/, '');
    const verification =
      u.role === 'LOCUM' ? (u.locumProfile?.verificationStatus ?? '') : 'N/A';

    return [
      u.id, u.email, u.role, u.status,
      nameOrClinic, cpsnsOrCity, verification,
      u.createdAt.toISOString(),
      u.lastLoginAt?.toISOString() ?? '',
    ].map(escapeCsv);
  });

  const csv = [header.map(escapeCsv), ...rows].map((r) => r.join(',')).join('\n');

  await db.auditLog.create({
    data: {
      adminActorId: session.adminId ?? undefined,
      action: 'EXPORT',
      entity: 'User',
      endpoint: '/api/admin/users/export',
    },
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="locumlink-users-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
