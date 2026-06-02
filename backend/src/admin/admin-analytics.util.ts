import type { PrismaService } from '../prisma/prisma.service.js';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const HOURS_48_MS = 48 * 60 * 60 * 1000;

export type AnalyticsSummary = {
  totalApplications: number;
  fillRatePct: number;
  activeUsers30d: number;
  growth: { month: string; locums: number; hosts: number; total: number }[];
  locations: { name: string; pct: number; count: number }[];
  postingPerformance: {
    filledWithin48hPct: number;
    stillOpenPct: number;
    closedPostingsPct: number;
  };
};

export async function buildAnalyticsSummary(
  prisma: PrismaService,
): Promise<AnalyticsSummary> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 4, 1);

  const [
    totalApplications,
    confirmedApplications,
    activeUsers30d,
    usersSinceFiveMonths,
    hostProfiles,
    confirmedPlacements,
    activePostings,
    totalPostings,
  ] = await Promise.all([
    prisma.application.count(),
    prisma.application.count({ where: { status: 'CONFIRMED' } }),
    prisma.user.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        role: { in: ['LOCUM', 'HOST'] },
      },
    }),
    prisma.user.findMany({
      where: {
        createdAt: { gte: fiveMonthsAgo },
        role: { in: ['LOCUM', 'HOST'] },
      },
      select: { createdAt: true, role: true },
    }),
    prisma.hostProfile.findMany({ select: { city: true } }),
    prisma.application.findMany({
      where: { status: 'CONFIRMED', placedAt: { not: null } },
      select: { appliedAt: true, placedAt: true },
    }),
    prisma.jobPosting.count({ where: { status: 'ACTIVE', isDeleted: false } }),
    prisma.jobPosting.count({ where: { isDeleted: false } }),
  ]);

  const fillRatePct =
    totalApplications > 0
      ? Math.round((confirmedApplications / totalApplications) * 100)
      : 0;

  const placedWithin48h = confirmedPlacements.filter(
    (a) =>
      a.placedAt && a.placedAt.getTime() - a.appliedAt.getTime() <= HOURS_48_MS,
  ).length;
  const filledWithin48hPct =
    confirmedPlacements.length > 0
      ? Math.round((placedWithin48h / confirmedPlacements.length) * 100)
      : 0;

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

  for (const u of usersSinceFiveMonths) {
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
    totalPostings > 0 ? Math.round((activePostings / totalPostings) * 100) : 0;
  const closedPostingsPct = totalPostings > 0 ? 100 - stillOpenPct : 0;

  return {
    totalApplications,
    fillRatePct,
    activeUsers30d,
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
    '',
    'Summary',
    'Metric,Value',
    ['Total Applications', summary.totalApplications],
    ['Confirmed Fill Rate (%)', summary.fillRatePct],
    ['New Users (30 days)', summary.activeUsers30d],
    [
      'Placements Within 48h (%)',
      summary.postingPerformance.filledWithin48hPct,
    ],
    ['Active Job Postings (%)', summary.postingPerformance.stillOpenPct],
    [
      'Closed / Other Postings (%)',
      summary.postingPerformance.closedPostingsPct,
    ],
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
