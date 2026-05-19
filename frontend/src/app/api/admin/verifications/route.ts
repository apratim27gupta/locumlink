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

  const [locumProfiles, hostProfiles] = await Promise.all([
    db.locumProfile.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { email: true, createdAt: true } },
      },
    }),
    db.hostProfile.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { email: true, createdAt: true } },
      },
    }),
  ]);

  const locumItems = locumProfiles.map((p) => ({
    id: p.id,
    profileType: 'locum' as const,
    userId: p.userId,
    email: p.user.email,
    name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.user.email,
    cpsns: p.cpsnsId ?? '',
    submittedAt: p.updatedAt.toISOString(),
    verificationStatus: p.verificationStatus,
  }));

  const hostItems = hostProfiles
    .filter((p) => p.cpsnsNumber && p.cpsnsNumber.replace(/\D/g, '').length === 9)
    .map((p) => ({
      id: p.id,
      profileType: 'host' as const,
      userId: p.userId,
      email: p.user.email,
      name: p.practiceName || p.user.email,
      cpsns: p.cpsnsNumber ?? '',
      submittedAt: p.updatedAt.toISOString(),
      verificationStatus: p.cpsnsVerificationStatus,
    }));

  return NextResponse.json({ items: [...locumItems, ...hostItems] });
}
