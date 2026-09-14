import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function friendlyAuditDetail(entity: string, after: unknown): string {
  if (!after || typeof after !== 'object' || Array.isArray(after)) return '';
  const data = after as Record<string, unknown>;
  if (entity === 'UserBroadcast') {
    const count = typeof data.recipientCount === 'number' ? data.recipientCount : 0;
    const users = `${count} ${data.selectAllFiltered ? 'matching the current filters' : 'selected'} ${count === 1 ? 'user' : 'users'}`;
    const channels = Array.isArray(data.channels)
      ? data.channels.filter((c) => c === 'email' || c === 'notification')
      : [];
    const via =
      channels.length === 2
        ? ' by email and notification'
        : channels.length === 1
          ? ` by ${channels[0]}`
          : '';
    if (typeof data.error === 'string' && data.error.trim()) {
      return `Broadcast failed for ${users}${via}. ${data.error.trim()}`;
    }
    if (data.queued === true) return `Broadcast queued for ${users}${via}.`;
    const failed = typeof data.failedCount === 'number' ? data.failedCount : 0;
    if (failed > 0) {
      return `Broadcast finished for ${users}${via}. ${failed} failed.`;
    }
    return `Broadcast sent to ${users}${via}.`;
  }
  return '';
}

export async function GET(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const take = Math.min(Number(searchParams.get('take') ?? 50), 500);
  const q = searchParams.get('q')?.trim() ?? '';

  const db = getDb();

  const logs = await db.auditLog.findMany({
    take,
    orderBy: { createdAt: 'desc' },
    where: q
      ? {
          OR: [
            { entity: { contains: q, mode: 'insensitive' } },
            { endpoint: { contains: q, mode: 'insensitive' } },
            { actor: { email: { contains: q, mode: 'insensitive' } } },
            { adminActor: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : undefined,
    include: {
      actor: { select: { email: true } },
      adminActor: { select: { email: true, name: true } },
      subject: { select: { email: true } },
    },
  });

  const items = logs.map((log) => ({
    id: log.id,
    actor:
      log.adminActor?.email ??
      log.adminActor?.name ??
      log.actor?.email ??
      'System',
    action: log.action,
    entity: log.entity,
    outcome: log.outcome,
    createdAt: log.createdAt.toISOString(),
    detail: friendlyAuditDetail(log.entity, log.after),
  }));

  return NextResponse.json({ items });
}
