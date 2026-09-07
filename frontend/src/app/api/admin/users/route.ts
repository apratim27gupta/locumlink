import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import {
  adminUserAccountFilterKey,
  adminUserCredentialFilterKey,
  computeInCredentialQueue,
  emptyAdminUserAccountCounts,
  emptyAdminUserCredentialCounts,
  parseAdminUserAccountFilters,
  parseAdminUserCredentialFilters,
} from '@/lib/adminUserDisplayStatus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(
    Math.max(Number(searchParams.get('pageSize') ?? 50) || 50, 1),
    1000,
  );
  const roleRaw = searchParams.get('role')?.trim().toUpperCase();
  const roleFilter =
    roleRaw === 'LOCUM' || roleRaw === 'HOST' ? roleRaw : undefined;
  const accountFilters = parseAdminUserAccountFilters(
    searchParams.get('accountStatus'),
  );
  const credentialFilters = parseAdminUserCredentialFilters(
    searchParams.get('credentialStatus'),
  );

  const db = getDb();

  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    where: {
      role: roleFilter ? roleFilter : { not: 'ADMIN' },
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

  const mapped = users.map((u) => {
    const role = u.role as 'LOCUM' | 'HOST' | 'ADMIN';
    const cpsnsVerificationStatus =
      role === 'LOCUM'
        ? (u.locumProfile?.cpsnsVerificationStatus ?? null)
        : role === 'HOST'
          ? (u.hostProfile?.cpsnsVerificationStatus ?? null)
          : null;
    const inCredentialQueue = computeInCredentialQueue({
      role,
      locumProfile: u.locumProfile,
      hostProfile: u.hostProfile,
    });
    const row = {
      id: u.id,
      email: u.email,
      role,
      status: u.status as 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DEACTIVATED',
      cpsnsVerificationStatus,
      inCredentialQueue,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      lastProfileReminderAt: u.lastProfileReminderAt?.toISOString() ?? null,
      lastProfileReminderChannel: u.lastProfileReminderChannel ?? null,
    };
    return {
      ...row,
      accountFilterKey: adminUserAccountFilterKey(row),
      credentialFilterKey: adminUserCredentialFilterKey(row),
    };
  });

  const accountCounts = emptyAdminUserAccountCounts();
  const credentialCounts = emptyAdminUserCredentialCounts();
  for (const row of mapped) {
    accountCounts[row.accountFilterKey] += 1;
    credentialCounts[row.credentialFilterKey] += 1;
  }

  const filtered = mapped.filter((row) => {
    const accountOk =
      accountFilters.length === 0 ||
      accountFilters.includes(row.accountFilterKey);
    const credentialOk =
      credentialFilters.length === 0 ||
      credentialFilters.includes(row.credentialFilterKey);
    return accountOk && credentialOk;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  return NextResponse.json({
    users: pageRows.map(
      ({ accountFilterKey: _a, credentialFilterKey: _c, ...rest }) => rest,
    ),
    total,
    page,
    pageSize,
    accountCounts,
    credentialCounts,
  });
}
