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
    verifiedHostUsers,
    locumUsers,
    verifiedLocumUsers,
    pendingLocumVerifications,
    pendingHostVerifications,
    activeJobPostings,
    totalJobPostings,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: 'HOST' } }),
    db.hostProfile.count({
      where: { cpsnsVerificationStatus: 'VERIFIED' },
    }),
    db.user.count({ where: { role: 'LOCUM' } }),
    db.locumProfile.count({
      where: { cpsnsVerificationStatus: 'VERIFIED' },
    }),
    db.locumProfile.count({
      where: {
        cpsnsVerificationStatus: { in: ['UNVERIFIED', 'PENDING_REVIEW'] },
      },
    }),
    db.hostProfile.count({
      where: {
        cpsnsVerificationStatus: { in: ['UNVERIFIED', 'PENDING_REVIEW'] },
        OR: [
          { cpsnsNumber: { not: null } },
          { practiceName: { not: '' } },
        ],
      },
    }),
    db.jobPosting.count({
      where: { status: 'ACTIVE', isDeleted: false },
    }),
    db.jobPosting.count({ where: { isDeleted: false } }),
  ]);

  return NextResponse.json({
    admin: { email: session.actorEmail },
    stats: {
      totalUsers,
      hostUsers,
      verifiedHostUsers,
      locumUsers,
      verifiedLocumUsers,
      pendingVerifications: pendingLocumVerifications + pendingHostVerifications,
      activeJobPostings,
      totalJobPostings,
    },
  });
}
