import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
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
  ] = await Promise.all([
    db.application.count(),
    db.application.count({ where: { status: 'CONFIRMED' } }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.user.findMany({
      where: { createdAt: { gte: fiveMonthsAgo } },
      select: { createdAt: true, role: true },
    }),
    db.hostProfile.findMany({
      select: { city: true },
    }),
  ]);

  const fillRatePct =
    totalApplications > 0
      ? Math.round((confirmedApplications / totalApplications) * 100)
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

  const [activePostings, totalPostings] = await Promise.all([
    db.jobPosting.count({ where: { status: 'ACTIVE', isDeleted: false } }),
    db.jobPosting.count({ where: { isDeleted: false } }),
  ]);

  const stillOpenPct =
    totalPostings > 0 ? Math.round((activePostings / totalPostings) * 100) : 0;
  const filledPct = totalPostings > 0 ? 100 - stillOpenPct : 0;

  return NextResponse.json({
    totalApplications,
    fillRatePct,
    activeUsers30d,
    growth,
    locations,
    postingPerformance: {
      filledWithin48hPct: filledPct,
      stillOpenPct,
    },
  });
}
