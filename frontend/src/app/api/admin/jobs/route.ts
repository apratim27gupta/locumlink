import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import { parseAnalyticsRange } from '@/lib/adminAnalyticsSummary';
import { listAdminJobs } from '@/lib/adminMarketplace';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const range = parseAnalyticsRange(searchParams);
  const result = await listAdminJobs(getDb(), {
    range,
    status: searchParams.get('status') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    page: Number(searchParams.get('page') ?? 1) || 1,
    pageSize: Number(searchParams.get('pageSize') ?? 50) || 50,
  });
  return NextResponse.json(result);
}
