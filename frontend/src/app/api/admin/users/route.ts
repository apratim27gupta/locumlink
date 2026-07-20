import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import {
  isEligibleForCredentialQueueHost,
  isEligibleForCredentialQueueLocum,
} from '@/lib/cpsnsVerify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const pageSize = Math.min(Number(searchParams.get('pageSize') ?? 100), 500);

  const db = getDb();

  const users = await db.user.findMany({
    take: pageSize,
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
          cpsnsVerificationStatus: true,
          cpsnsId: true,
          licenseFileName: true,
          resumeFileName: true,
          firstName: true,
          lastName: true,
        },
      },
      hostProfile: {
        select: {
          cpsnsVerificationStatus: true,
          cpsnsNumber: true,
          practiceName: true,
          licenseFile: true,
          photoIdFile: true,
        },
      },
      lastProfileReminderAt: true,
      lastProfileReminderChannel: true,
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      cpsnsVerificationStatus:
        u.role === 'LOCUM'
          ? u.locumProfile?.cpsnsVerificationStatus ?? null
          : u.role === 'HOST'
            ? u.hostProfile?.cpsnsVerificationStatus ?? null
            : null,
      inCredentialQueue:
        u.role === 'LOCUM' && u.locumProfile
          ? isEligibleForCredentialQueueLocum(u.locumProfile)
          : u.role === 'HOST' && u.hostProfile
            ? isEligibleForCredentialQueueHost(u.hostProfile)
            : false,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      lastProfileReminderAt: u.lastProfileReminderAt?.toISOString() ?? null,
      lastProfileReminderChannel: u.lastProfileReminderChannel ?? null,
    })),
  });
}
