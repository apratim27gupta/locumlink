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

  const profiles = await db.locumProfile.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { email: true, createdAt: true } },
    },
  });

  const items = profiles.map((p) => ({
    id: p.id,
    userId: p.userId,
    email: p.user.email,
    name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.user.email,
    cpsns: p.cpsnsId ?? '',
    submittedAt: p.createdAt.toISOString(),
    verificationStatus: p.verificationStatus,
  }));

  return NextResponse.json({ items });
}
