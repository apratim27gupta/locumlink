import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import {
  credentialReviewDataOnProfileSave,
  isCpsnsNineDigitsFormat,
  isInCredentialQueue,
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

  const [locumProfilesRaw, hostProfilesRaw] = await Promise.all([
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

  const locumProfiles = await Promise.all(
    locumProfilesRaw.map(async (p) => {
      const digits = normalizeCpsns(p.cpsnsId);
      const profileSubmittedForReview = Boolean(
        p.licenseFileName?.trim()
        || p.resumeFileName?.trim()
        || p.firstName?.trim()
        || p.lastName?.trim(),
      );
      const patch = credentialReviewDataOnProfileSave(
        {
          cpsnsNumber: p.cpsnsId,
          cpsnsVerificationStatus: p.cpsnsVerificationStatus,
        },
        digits,
        profileSubmittedForReview,
      );
      if (
        !patch ||
        p.cpsnsVerificationStatus === patch.cpsnsVerificationStatus
      ) {
        return p;
      }
      return db.locumProfile.update({
        where: { id: p.id },
        data: patch,
        include: { user: { select: { email: true, createdAt: true } } },
      });
    }),
  );

  // Promote stale UNVERIFIED hosts with a valid CPSNS into the review queue.
  const hostProfiles = await Promise.all(
    hostProfilesRaw.map(async (p) => {
      const digits = normalizeCpsns(p.cpsnsNumber);
      const profileSubmittedForReview = Boolean(
        p.licenseFile?.trim()
        || p.photoIdFile?.trim()
        || p.practiceName?.trim(),
      );
      const patch = credentialReviewDataOnProfileSave(
        {
          cpsnsNumber: p.cpsnsNumber,
          cpsnsVerificationStatus: p.cpsnsVerificationStatus,
        },
        digits,
        profileSubmittedForReview,
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

  const locumItems = locumProfiles
    .filter((p) => {
      if (!isInCredentialQueue(p.cpsnsVerificationStatus))
        return false;
      const hasCpsns = isCpsnsNineDigitsFormat(p.cpsnsId);
      const hasProfile = Boolean(
        p.licenseFileName?.trim()
        || p.resumeFileName?.trim()
        || p.firstName?.trim()
        || p.lastName?.trim(),
      );
      return hasCpsns || hasProfile;
    })
    .map((p) => ({
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
      if (!isInCredentialQueue(p.cpsnsVerificationStatus)) return false;
      const hasCpsns = isCpsnsNineDigitsFormat(p.cpsnsNumber);
      const hasClinicProfile = Boolean(p.practiceName?.trim());
      const hasDocs = Boolean(p.licenseFile?.trim() || p.photoIdFile?.trim());
      return hasCpsns || hasClinicProfile || hasDocs;
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
