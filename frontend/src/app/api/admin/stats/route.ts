import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  const [
    totalUsers,
    hostUsers,
    locumUsers,
    pendingVerifications,
    activeJobPostings,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: 'HOST' } }),
    db.user.count({ where: { role: 'LOCUM' } }),
    db.locumProfile.count({
      where: {
        verificationStatus: { in: ['UNVERIFIED', 'PENDING_REVIEW'] },
      },
    }),
    db.jobPosting.count({
      where: { status: 'ACTIVE', isDeleted: false },
    }),
  ]);

  return NextResponse.json({
    stats: {
      totalUsers,
      hostUsers,
      locumUsers,
      pendingVerifications,
      activeJobPostings,
    },
  });
}
