import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import {
  cpsnsVerificationData,
  isCpsnsNineDigitsFormat,
  isHostVerificationPending,
  normalizeCpsns,
} from '@/lib/cpsnsVerify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  const [locumProfiles, hostProfilesRaw] = await Promise.all([
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

  // Promote stale UNVERIFIED hosts with a valid CPSNS into the review queue.
  const hostProfiles = await Promise.all(
    hostProfilesRaw.map(async (p) => {
      const digits = normalizeCpsns(p.cpsnsNumber);
      const patch = cpsnsVerificationData(
        {
          cpsnsNumber: p.cpsnsNumber,
          cpsnsVerificationStatus: p.cpsnsVerificationStatus,
        },
        digits,
      );
      if (
        !patch ||
        p.cpsnsVerificationStatus === patch.cpsnsVerificationStatus
      ) {
        return p;
      }
      return db.hostProfile.update({
        where: { id: p.id },
        data: patch,
        include: { user: { select: { email: true, createdAt: true } } },
      });
    }),
  );

  const locumItems = locumProfiles.map((p) => ({
    id: p.id,
    profileType: 'locum' as const,
    userId: p.userId,
    email: p.user.email,
    name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.user.email,
    cpsns: p.cpsnsId ?? '',
    submittedAt: p.updatedAt.toISOString(),
    cpsnsVerificationStatus: p.cpsnsVerificationStatus,
  }));

  const hostItems = hostProfiles
    .filter((p) => {
      if (!isHostVerificationPending(p.cpsnsVerificationStatus)) return false;
      const hasCpsns = isCpsnsNineDigitsFormat(p.cpsnsNumber);
      const hasClinicProfile = Boolean(p.practiceName?.trim());
      return hasCpsns || hasClinicProfile;
    })
    .map((p) => ({
      id: p.id,
      profileType: 'host' as const,
      userId: p.userId,
      email: p.user.email,
      name: p.practiceName || p.user.email,
      cpsns: normalizeCpsns(p.cpsnsNumber) || '—',
      submittedAt: p.updatedAt.toISOString(),
      cpsnsVerificationStatus: p.cpsnsVerificationStatus,
    }));

  return NextResponse.json({ items: [...locumItems, ...hostItems] });
}
