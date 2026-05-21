import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';
import {
  analyticsSummaryToCsv,
  buildAnalyticsSummary,
} from '@/lib/adminAnalyticsSummary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const summary = await buildAnalyticsSummary(db);
  const csv = analyticsSummaryToCsv(summary);
  const date = new Date().toISOString().slice(0, 10);

  await db.auditLog.create({
    data: {
      adminActorId: session.adminId,
      action: 'EXPORT',
      entity: 'AnalyticsReport',
      endpoint: '/api/admin/analytics/export',
    },
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="locumlink-analytics-${date}.csv"`,
    },
  });
}
