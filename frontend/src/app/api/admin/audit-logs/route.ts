import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      'system',
    action: log.action,
    entity: log.entity + (log.entityId ? ` (${log.entityId})` : ''),
    createdAt: log.createdAt.toISOString(),
    detail: log.subject?.email
      ? `Subject: ${log.subject.email}`
      : log.endpoint ?? '',
  }));

  return NextResponse.json({ items });
}
