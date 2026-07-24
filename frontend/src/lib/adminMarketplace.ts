import type { Prisma, PrismaClient } from '@prisma/client';
import type { AnalyticsDateRange } from './adminAnalyticsSummary';

export type AdminJobListItem = {
  id: string;
  title: string;
  status: string;
  location: string;
  isRural: boolean;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  fullHalfDay: string | null;
  leaveType: string | null;
  payPerDay: string | null;
  createdAt: string;
  applicationCount: number;
  selectedCount: number;
  acceptedCount: number;
  host: {
    userId: string;
    email: string;
    practiceName: string;
    contactName: string;
    city: string;
  };
};

export type AdminApplicationItem = {
  id: string;
  status: string;
  locumResponse: string | null;
  coverNote: string | null;
  appliedAt: string;
  placedAt: string | null;
  locumAcceptedAt: string | null;
  statusChangedAt: string;
  locum: {
    userId: string;
    email: string;
    name: string;
    specialty: string | null;
    yearsOfExperience: number | null;
  };
  job: {
    id: string;
    title: string;
    status: string;
    location: string;
  };
  host: {
    userId: string;
    email: string;
    practiceName: string;
    contactName: string;
  };
};

function createdAtFilter(range: AnalyticsDateRange): Prisma.DateTimeFilter | undefined {
  if (!range.dateFrom && !range.dateTo) return undefined;
  return {
    ...(range.dateFrom ? { gte: range.dateFrom } : {}),
    ...(range.dateTo ? { lte: range.dateTo } : {}),
  };
}

function hostContactName(h: {
  contactFirstName: string | null;
  contactLastName: string | null;
  practiceName: string;
}): string {
  const n = [h.contactFirstName, h.contactLastName].filter(Boolean).join(' ').trim();
  return n || h.practiceName;
}

function locumName(p: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const n = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return n || p.email.split('@')[0] || p.email;
}

function decimalStr(v: { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

export async function listAdminJobs(
  db: PrismaClient,
  params: {
    range?: AnalyticsDateRange;
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{ items: AdminJobListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 200);
  const createdAt = createdAtFilter(params.range ?? {});
  const q = params.q?.trim();

  const where: Prisma.JobPostingWhereInput = {
    isDeleted: false,
    ...(createdAt ? { createdAt } : {}),
    ...(params.status && params.status !== 'all'
      ? { status: params.status as 'DRAFT' | 'ACTIVE' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { location: { contains: q, mode: 'insensitive' } },
            { hostProfile: { practiceName: { contains: q, mode: 'insensitive' } } },
            { hostProfile: { user: { email: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.jobPosting.count({ where }),
    db.jobPosting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        status: true,
        location: true,
        isRural: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        fullHalfDay: true,
        leaveType: true,
        payPerDay: true,
        createdAt: true,
        hostProfile: {
          select: {
            practiceName: true,
            city: true,
            contactFirstName: true,
            contactLastName: true,
            user: { select: { id: true, email: true } },
          },
        },
        applications: {
          select: {
            status: true,
            locumResponse: true,
            locumAcceptedAt: true,
          },
        },
      },
    }),
  ]);

  const items: AdminJobListItem[] = rows.map((row) => {
    const selectedCount = row.applications.filter(
      (a) => a.status === 'SHORTLISTED' || a.status === 'CONFIRMED',
    ).length;
    const acceptedCount = row.applications.filter(
      (a) => a.locumResponse === 'ACCEPTED' || a.locumAcceptedAt != null,
    ).length;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      location: row.location,
      isRural: row.isRural,
      startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
      endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
      startTime: row.startTime,
      endTime: row.endTime,
      fullHalfDay: row.fullHalfDay,
      leaveType: row.leaveType,
      payPerDay: decimalStr(row.payPerDay),
      createdAt: row.createdAt.toISOString(),
      applicationCount: row.applications.length,
      selectedCount,
      acceptedCount,
      host: {
        userId: row.hostProfile.user.id,
        email: row.hostProfile.user.email,
        practiceName: row.hostProfile.practiceName,
        contactName: hostContactName(row.hostProfile),
        city: row.hostProfile.city,
      },
    };
  });

  return { items, total, page, pageSize };
}

export async function getAdminJobDetail(
  db: PrismaClient,
  jobId: string,
): Promise<{
  job: AdminJobListItem & {
    description: string;
    servicesRequired: string[];
    requiredSpecialty: string | null;
    minYearsExperience: number | null;
  };
  applications: AdminApplicationItem[];
} | null> {
  const row = await db.jobPosting.findFirst({
    where: { id: jobId, isDeleted: false },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      location: true,
      isRural: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      fullHalfDay: true,
      leaveType: true,
      payPerDay: true,
      createdAt: true,
      servicesRequired: true,
      requiredSpecialty: true,
      minYearsExperience: true,
      hostProfile: {
        select: {
          practiceName: true,
          city: true,
          contactFirstName: true,
          contactLastName: true,
          user: { select: { id: true, email: true } },
        },
      },
      applications: {
        orderBy: { appliedAt: 'desc' },
        select: {
          id: true,
          status: true,
          locumResponse: true,
          coverNote: true,
          appliedAt: true,
          placedAt: true,
          locumAcceptedAt: true,
          statusChangedAt: true,
          locumProfile: {
            select: {
              firstName: true,
              lastName: true,
              specialty: true,
              yearsOfExperience: true,
              user: { select: { id: true, email: true } },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  const selectedCount = row.applications.filter(
    (a) => a.status === 'SHORTLISTED' || a.status === 'CONFIRMED',
  ).length;
  const acceptedCount = row.applications.filter(
    (a) => a.locumResponse === 'ACCEPTED' || a.locumAcceptedAt != null,
  ).length;

  const host = {
    userId: row.hostProfile.user.id,
    email: row.hostProfile.user.email,
    practiceName: row.hostProfile.practiceName,
    contactName: hostContactName(row.hostProfile),
    city: row.hostProfile.city,
  };

  const jobBase: AdminJobListItem = {
    id: row.id,
    title: row.title,
    status: row.status,
    location: row.location,
    isRural: row.isRural,
    startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    startTime: row.startTime,
    endTime: row.endTime,
    fullHalfDay: row.fullHalfDay,
    leaveType: row.leaveType,
    payPerDay: decimalStr(row.payPerDay),
    createdAt: row.createdAt.toISOString(),
    applicationCount: row.applications.length,
    selectedCount,
    acceptedCount,
    host,
  };

  const applications: AdminApplicationItem[] = row.applications.map((a) => ({
    id: a.id,
    status: a.status,
    locumResponse: a.locumResponse,
    coverNote: a.coverNote,
    appliedAt: a.appliedAt.toISOString(),
    placedAt: a.placedAt?.toISOString() ?? null,
    locumAcceptedAt: a.locumAcceptedAt?.toISOString() ?? null,
    statusChangedAt: a.statusChangedAt.toISOString(),
    locum: {
      userId: a.locumProfile.user.id,
      email: a.locumProfile.user.email,
      name: locumName({
        firstName: a.locumProfile.firstName,
        lastName: a.locumProfile.lastName,
        email: a.locumProfile.user.email,
      }),
      specialty: a.locumProfile.specialty
        ? String(a.locumProfile.specialty)
        : null,
      yearsOfExperience: a.locumProfile.yearsOfExperience,
    },
    job: {
      id: row.id,
      title: row.title,
      status: row.status,
      location: row.location,
    },
    host: {
      userId: host.userId,
      email: host.email,
      practiceName: host.practiceName,
      contactName: host.contactName,
    },
  }));

  return {
    job: {
      ...jobBase,
      description: row.description,
      servicesRequired: row.servicesRequired,
      requiredSpecialty: row.requiredSpecialty
        ? String(row.requiredSpecialty)
        : null,
      minYearsExperience: row.minYearsExperience,
    },
    applications,
  };
}

export async function listAdminApplications(
  db: PrismaClient,
  params: {
    range?: AnalyticsDateRange;
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{ items: AdminApplicationItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 200);
  const appliedAt = createdAtFilter(params.range ?? {});
  const q = params.q?.trim();

  const where: Prisma.ApplicationWhereInput = {
    ...(appliedAt ? { appliedAt } : {}),
    ...(params.status && params.status !== 'all'
      ? {
          status: params.status as
            | 'APPLIED'
            | 'SHORTLISTED'
            | 'CONFIRMED'
            | 'REJECTED'
            | 'WITHDRAWN',
        }
      : {}),
    ...(q
      ? {
          OR: [
            { locumProfile: { firstName: { contains: q, mode: 'insensitive' } } },
            { locumProfile: { lastName: { contains: q, mode: 'insensitive' } } },
            { locumProfile: { user: { email: { contains: q, mode: 'insensitive' } } } },
            { jobPosting: { title: { contains: q, mode: 'insensitive' } } },
            { jobPosting: { hostProfile: { practiceName: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.application.count({ where }),
    db.application.findMany({
      where,
      orderBy: { appliedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        locumResponse: true,
        coverNote: true,
        appliedAt: true,
        placedAt: true,
        locumAcceptedAt: true,
        statusChangedAt: true,
        locumProfile: {
          select: {
            firstName: true,
            lastName: true,
            specialty: true,
            yearsOfExperience: true,
            user: { select: { id: true, email: true } },
          },
        },
        jobPosting: {
          select: {
            id: true,
            title: true,
            status: true,
            location: true,
            hostProfile: {
              select: {
                practiceName: true,
                contactFirstName: true,
                contactLastName: true,
                user: { select: { id: true, email: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const items: AdminApplicationItem[] = rows.map((a) => {
    const host = a.jobPosting.hostProfile;
    return {
      id: a.id,
      status: a.status,
      locumResponse: a.locumResponse,
      coverNote: a.coverNote,
      appliedAt: a.appliedAt.toISOString(),
      placedAt: a.placedAt?.toISOString() ?? null,
      locumAcceptedAt: a.locumAcceptedAt?.toISOString() ?? null,
      statusChangedAt: a.statusChangedAt.toISOString(),
      locum: {
        userId: a.locumProfile.user.id,
        email: a.locumProfile.user.email,
        name: locumName({
          firstName: a.locumProfile.firstName,
          lastName: a.locumProfile.lastName,
          email: a.locumProfile.user.email,
        }),
        specialty: a.locumProfile.specialty
        ? String(a.locumProfile.specialty)
        : null,
        yearsOfExperience: a.locumProfile.yearsOfExperience,
      },
      job: {
        id: a.jobPosting.id,
        title: a.jobPosting.title,
        status: a.jobPosting.status,
        location: a.jobPosting.location,
      },
      host: {
        userId: host.user.id,
        email: host.user.email,
        practiceName: host.practiceName,
        contactName: hostContactName(host),
      },
    };
  });

  return { items, total, page, pageSize };
}
