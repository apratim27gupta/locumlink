import type { Prisma, PrismaClient } from '@prisma/client';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS_48_MS = 48 * 60 * 60 * 1000;

export type AnalyticsDateRange = {
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

export type AnalyticsSummary = {
  period: { from: string | null; to: string | null; label: string };
  totalApplications: number;
  fillRatePct: number;
  hostConfirmRatePct: number;
  locumAcceptRatePct: number;
  suitableLocumFoundPct: number;
  newUsersInPeriod: number;
  /** @deprecated use newUsersInPeriod */
  activeUsers30d: number;
  avgHoursToConfirm: number | null;
  avgHoursToAccept: number | null;
  applicationsByStatus: {
    applied: number;
    shortlisted: number;
    confirmed: number;
    rejected: number;
    withdrawn: number;
  };
  acceptedCount: number;
  postedJobsCount: number;
  postingsByStatus: {
    draft: number;
    active: number;
    ongoing: number;
    completed: number;
    expired: number;
    cancelled: number;
  };
  unfilledExpiredCount: number;
  growth: { month: string; locums: number; hosts: number; total: number }[];
  locations: { name: string; pct: number; count: number }[];
  postingPerformance: {
    filledWithin48hPct: number;
    stillOpenPct: number;
    closedPostingsPct: number;
  };
};

function parseIsoDate(value: string | null | undefined, endOfDay: boolean): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

export function parseAnalyticsRange(
  searchParams: URLSearchParams | { get(name: string): string | null },
): AnalyticsDateRange & { label: string } {
  const preset = searchParams.get('preset')?.trim() || '30d';
  const now = new Date();

  if (preset === 'all') {
    return { dateFrom: null, dateTo: null, label: 'All time' };
  }

  if (preset === 'custom') {
    const dateFrom = parseIsoDate(searchParams.get('dateFrom'), false);
    const dateTo = parseIsoDate(searchParams.get('dateTo'), true);
    return {
      dateFrom,
      dateTo,
      label:
        dateFrom || dateTo
          ? `${dateFrom ? dateFrom.toISOString().slice(0, 10) : '…'} → ${dateTo ? dateTo.toISOString().slice(0, 10) : '…'}`
          : 'Custom range',
    };
  }

  const days = preset === '90d' ? 90 : 30;
  const dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - days);
  dateFrom.setHours(0, 0, 0, 0);
  return {
    dateFrom,
    dateTo: null,
    label: preset === '90d' ? 'Last 90 days' : 'Last 30 days',
  };
}

function createdAtFilter(range: AnalyticsDateRange): Prisma.DateTimeFilter | undefined {
  if (!range.dateFrom && !range.dateTo) return undefined;
  return {
    ...(range.dateFrom ? { gte: range.dateFrom } : {}),
    ...(range.dateTo ? { lte: range.dateTo } : {}),
  };
}

function avgHours(
  rows: Array<{ start: Date; end: Date | null }>,
): number | null {
  const valid = rows.filter((r): r is { start: Date; end: Date } => !!r.end);
  if (valid.length === 0) return null;
  const totalMs = valid.reduce((sum, r) => sum + (r.end.getTime() - r.start.getTime()), 0);
  return Math.round((totalMs / valid.length / 3600000) * 10) / 10;
}

export async function buildAnalyticsSummary(
  db: PrismaClient,
  range: AnalyticsDateRange & { label?: string } = {},
): Promise<AnalyticsSummary> {
  const now = new Date();
  const appliedAt = createdAtFilter(range);
  const postingCreatedAt = createdAtFilter(range);
  const userCreatedAt = createdAtFilter(range) ?? (() => {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    return { gte: thirtyDaysAgo };
  })();

  const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 4, 1);
  const growthFrom = range.dateFrom && range.dateFrom > fiveMonthsAgo
    ? range.dateFrom
    : fiveMonthsAgo;

  const appWhere: Prisma.ApplicationWhereInput = appliedAt
    ? { appliedAt }
    : {};
  const postingWhereBase: Prisma.JobPostingWhereInput = {
    isDeleted: false,
    ...(postingCreatedAt ? { createdAt: postingCreatedAt } : {}),
  };

  const [
    appStatusGroups,
    acceptedCount,
    confirmedWithTimes,
    acceptedWithTimes,
    newUsersInPeriod,
    usersForGrowth,
    hostProfiles,
    postingStatusGroups,
    activePostings,
    totalPostingsInScope,
    finishedFilled,
    finishedUnfilled,
    unfilledExpiredCount,
  ] = await Promise.all([
    db.application.groupBy({
      by: ['status'],
      where: appWhere,
      _count: { id: true },
    }),
    db.application.count({
      where: {
        ...appWhere,
        OR: [
          { locumResponse: 'ACCEPTED' },
          { locumAcceptedAt: { not: null } },
        ],
      },
    }),
    db.application.findMany({
      where: {
        ...appWhere,
        status: 'CONFIRMED',
        placedAt: { not: null },
      },
      select: { appliedAt: true, placedAt: true },
    }),
    db.application.findMany({
      where: {
        ...appWhere,
        locumAcceptedAt: { not: null },
        placedAt: { not: null },
      },
      select: { placedAt: true, locumAcceptedAt: true },
    }),
    db.user.count({
      where: {
        createdAt: userCreatedAt,
        role: { in: ['LOCUM', 'HOST'] },
      },
    }),
    db.user.findMany({
      where: {
        createdAt: {
          gte: growthFrom,
          ...(range.dateTo ? { lte: range.dateTo } : {}),
        },
        role: { in: ['LOCUM', 'HOST'] },
      },
      select: { createdAt: true, role: true },
    }),
    db.hostProfile.findMany({ select: { city: true } }),
    db.jobPosting.groupBy({
      by: ['status'],
      where: postingWhereBase,
      _count: { id: true },
    }),
    db.jobPosting.count({
      where: { ...postingWhereBase, status: 'ACTIVE' },
    }),
    db.jobPosting.count({ where: postingWhereBase }),
    db.jobPosting.count({
      where: {
        ...postingWhereBase,
        status: { in: ['ONGOING', 'COMPLETED'] },
      },
    }),
    db.jobPosting.count({
      where: {
        ...postingWhereBase,
        status: { in: ['EXPIRED', 'CANCELLED'] },
      },
    }),
    db.jobPosting.count({
      where: {
        ...postingWhereBase,
        status: 'EXPIRED',
        applications: {
          none: {
            OR: [
              { locumResponse: 'ACCEPTED' },
              { locumAcceptedAt: { not: null } },
            ],
          },
        },
      },
    }),
  ]);

  const applicationsByStatus = {
    applied: 0,
    shortlisted: 0,
    confirmed: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const g of appStatusGroups) {
    const n = g._count.id;
    if (g.status === 'APPLIED') applicationsByStatus.applied = n;
    else if (g.status === 'SHORTLISTED') applicationsByStatus.shortlisted = n;
    else if (g.status === 'CONFIRMED') applicationsByStatus.confirmed = n;
    else if (g.status === 'REJECTED') applicationsByStatus.rejected = n;
    else if (g.status === 'WITHDRAWN') applicationsByStatus.withdrawn = n;
  }

  const totalApplications = Object.values(applicationsByStatus).reduce((a, b) => a + b, 0);
  const confirmedApplications = applicationsByStatus.confirmed;
  const hostConfirmRatePct =
    totalApplications > 0
      ? Math.round((confirmedApplications / totalApplications) * 100)
      : 0;
  const locumAcceptRatePct =
    confirmedApplications > 0
      ? Math.round((acceptedCount / confirmedApplications) * 100)
      : 0;
  // Keep legacy fillRate as host confirm rate for CSV/backward compat
  const fillRatePct = hostConfirmRatePct;

  const finishedTotal = finishedFilled + finishedUnfilled;
  const suitableLocumFoundPct =
    finishedTotal > 0 ? Math.round((finishedFilled / finishedTotal) * 100) : 0;

  const placedWithin48h = confirmedWithTimes.filter(
    (a) =>
      a.placedAt
      && a.placedAt.getTime() - a.appliedAt.getTime() <= HOURS_48_MS,
  ).length;
  const filledWithin48hPct =
    confirmedWithTimes.length > 0
      ? Math.round((placedWithin48h / confirmedWithTimes.length) * 100)
      : 0;

  const avgHoursToConfirm = avgHours(
    confirmedWithTimes.map((a) => ({ start: a.appliedAt, end: a.placedAt })),
  );
  const avgHoursToAccept = avgHours(
    acceptedWithTimes.map((a) => ({ start: a.placedAt!, end: a.locumAcceptedAt })),
  );

  const monthBuckets = new Map<
    string,
    { month: string; locums: number; hosts: number; total: number }
  >();
  for (let i = 4; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthBuckets.set(key, {
      month: MONTH_LABELS[d.getMonth()] ?? '',
      locums: 0,
      hosts: 0,
      total: 0,
    });
  }

  for (const u of usersForGrowth) {
    const key = `${u.createdAt.getFullYear()}-${u.createdAt.getMonth()}`;
    const bucket = monthBuckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (u.role === 'LOCUM') bucket.locums += 1;
    if (u.role === 'HOST') bucket.hosts += 1;
  }

  const growth = Array.from(monthBuckets.values());

  const cityCounts = new Map<string, number>();
  for (const h of hostProfiles) {
    const city = (h.city ?? '').trim();
    if (!city) continue;
    const label = city
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    cityCounts.set(label, (cityCounts.get(label) ?? 0) + 1);
  }

  const topCities = Array.from(cityCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const cityTotal = topCities.reduce((s, c) => s + c.count, 0) || 1;
  const locations = topCities.map((c) => ({
    name: c.name,
    count: c.count,
    pct: Math.round((c.count / cityTotal) * 100),
  }));

  const stillOpenPct =
    totalPostingsInScope > 0
      ? Math.round((activePostings / totalPostingsInScope) * 100)
      : 0;
  const closedPostingsPct = totalPostingsInScope > 0 ? 100 - stillOpenPct : 0;

  const postingsByStatus = {
    draft: 0,
    active: 0,
    ongoing: 0,
    completed: 0,
    expired: 0,
    cancelled: 0,
  };
  for (const g of postingStatusGroups) {
    const n = g._count.id;
    const key = g.status.toLowerCase() as keyof typeof postingsByStatus;
    if (key in postingsByStatus) postingsByStatus[key] = n;
  }

  const postedJobsCount =
    postingsByStatus.active
    + postingsByStatus.ongoing
    + postingsByStatus.completed
    + postingsByStatus.expired
    + postingsByStatus.cancelled;

  return {
    period: {
      from: range.dateFrom ? range.dateFrom.toISOString() : null,
      to: range.dateTo ? range.dateTo.toISOString() : null,
      label: range.label ?? 'All time',
    },
    totalApplications,
    fillRatePct,
    hostConfirmRatePct,
    locumAcceptRatePct,
    suitableLocumFoundPct,
    newUsersInPeriod,
    activeUsers30d: newUsersInPeriod,
    avgHoursToConfirm,
    avgHoursToAccept,
    applicationsByStatus,
    acceptedCount,
    postedJobsCount,
    postingsByStatus,
    unfilledExpiredCount,
    growth,
    locations,
    postingPerformance: {
      filledWithin48hPct,
      stillOpenPct,
      closedPostingsPct,
    },
  };
}

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function analyticsSummaryToCsv(summary: AnalyticsSummary): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    'LocumLink Analytics Report',
    `Generated,${date}`,
    `Period,${summary.period.label}`,
    '',
    'Summary',
    'Metric,Value',
    ['Total Applications', summary.totalApplications],
    ['Applied', summary.applicationsByStatus.applied],
    ['Shortlisted', summary.applicationsByStatus.shortlisted],
    ['Confirmed', summary.applicationsByStatus.confirmed],
    ['Accepted (locum)', summary.acceptedCount],
    ['Rejected', summary.applicationsByStatus.rejected],
    ['Withdrawn', summary.applicationsByStatus.withdrawn],
    ['Host Confirm Rate (%)', summary.hostConfirmRatePct],
    ['Locum Accept Rate (%)', summary.locumAcceptRatePct],
    ['Suitable Locum Found (%)', summary.suitableLocumFoundPct],
    ['Avg Hours to Confirm', summary.avgHoursToConfirm ?? ''],
    ['Avg Hours to Accept', summary.avgHoursToAccept ?? ''],
    ['New Users (period)', summary.newUsersInPeriod],
    ['Posted Jobs', summary.postedJobsCount],
    ['Active Postings', summary.postingsByStatus.active],
    ['Ongoing', summary.postingsByStatus.ongoing],
    ['Completed', summary.postingsByStatus.completed],
    ['Expired', summary.postingsByStatus.expired],
    ['Cancelled', summary.postingsByStatus.cancelled],
    ['Unfilled Expired', summary.unfilledExpiredCount],
    ['Placements Within 48h (%)', summary.postingPerformance.filledWithin48hPct],
    ['Active Job Postings (%)', summary.postingPerformance.stillOpenPct],
    ['Closed / Other Postings (%)', summary.postingPerformance.closedPostingsPct],
  ].map((row) => (Array.isArray(row) ? row.map(escapeCsv).join(',') : row));

  lines.push('', 'User Sign-ups (Last 5 Months)', 'Month,Locums,Hosts,Total');
  for (const g of summary.growth) {
    lines.push([g.month, g.locums, g.hosts, g.total].map(escapeCsv).join(','));
  }

  lines.push('', 'Top Host Cities', 'City,Count,Share (%)');
  for (const loc of summary.locations) {
    lines.push([loc.name, loc.count, loc.pct].map(escapeCsv).join(','));
  }

  return `${lines.join('\n')}\n`;
}
