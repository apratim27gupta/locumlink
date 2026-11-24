import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import {
  isEligibleForCredentialQueueHost,
  isEligibleForCredentialQueueLocum,
} from '@/lib/cpsnsVerify';

/**
 * Statuses counted in the credential queue card. Mirrors the backend's
 * VERIFICATION_PENDING_FILTER used by the verifications "pending" list, so the
 * card and the list always agree. (REJECTED lives in its own tab, not here.)
 */
const CREDENTIAL_QUEUE_STATUSES = ['UNVERIFIED', 'PENDING_REVIEW'] as const;

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
    locumQueueCandidates,
    hostQueueCandidates,
    activeJobPostings,
    totalJobPostings,
    openReports,
    openHostTickets,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: 'HOST' } }),
    db.hostProfile.count({
      where: {
        cpsnsVerificationStatus: 'VERIFIED',
        user: { role: 'HOST' },
      },
    }),
    db.user.count({ where: { role: 'LOCUM' } }),
    db.locumProfile.count({
      where: {
        cpsnsVerificationStatus: 'VERIFIED',
        user: { role: 'LOCUM' },
      },
    }),
    // Fetch every profile sitting at a queue status, then filter in JS with the
    // SAME eligibility rule the verifications queue uses — so the card count can
    // never drift from the list again. "Empty" profiles (no CPSNS / no submitted
    // details) are excluded, matching "only the ones who filled out the form".
    db.locumProfile.findMany({
      where: { cpsnsVerificationStatus: { in: [...CREDENTIAL_QUEUE_STATUSES] } },
      select: {
        cpsnsVerificationStatus: true,
        cpsnsId: true,
        licenseFileName: true,
        resumeFileName: true,
        firstName: true,
        lastName: true,
      },
    }),
    db.hostProfile.findMany({
      where: { cpsnsVerificationStatus: { in: [...CREDENTIAL_QUEUE_STATUSES] } },
      select: {
        cpsnsVerificationStatus: true,
        cpsnsNumber: true,
        practiceName: true,
        licenseFile: true,
        photoIdFile: true,
      },
    }),
    db.jobPosting.count({
      where: { status: 'ACTIVE', isDeleted: false },
    }),
    db.jobPosting.count({ where: { isDeleted: false } }),
    db.userReport.count({ where: { status: 'OPEN' } }),
    db.supportTicket.count({ where: { status: 'OPEN' } }),
  ]);

  // Count only profiles that actually submitted something — identical rule to
  // the credential/verifications queue list.
  const pendingVerifications =
    locumQueueCandidates.filter((p) => isEligibleForCredentialQueueLocum(p))
      .length +
    hostQueueCandidates.filter((p) => isEligibleForCredentialQueueHost(p))
      .length;

  return NextResponse.json({
    admin: { email: session.actorEmail },
    stats: {
      totalUsers,
      hostUsers,
      verifiedHostUsers,
      locumUsers,
      verifiedLocumUsers,
      pendingVerifications,
      openReports,
      openHostTickets,
      activeJobPostings,
      totalJobPostings,
    },
  });
}
