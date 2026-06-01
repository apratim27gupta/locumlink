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

  const db = getDb();
  const events = await db.adminNotificationEvent.findMany({
    where: { adminId: session.adminId },
    orderBy: { sentAt: 'desc' },
    take: 50,
  });

  const notifications = events.map((e) => {
    const payload = (e.payload ?? {}) as {
      title?: string;
      body?: string;
      href?: string;
      priority?: string;
      actionLabel?: string;
      eventType?: string;
    };
    const eventType = payload.eventType ?? e.eventType;
    let type: 'registration' | 'credential' | 'flagged' = 'registration';
    if (eventType.includes('CREDENTIAL')) type = 'credential';
    else if (eventType.includes('FLAGGED')) type = 'flagged';

    return {
      id: e.id,
      type,
      title: payload.title ?? e.eventType,
      body: payload.body ?? '',
      href: payload.href ?? '/admin',
      read: e.deliveryStatus === 'READ',
      createdAt: e.sentAt.toISOString(),
      priority: payload.priority,
      actionLabel: payload.actionLabel,
      eventType,
    };
  });

  const total = notifications.filter((n) => !n.read).length;
  return NextResponse.json({ total, notifications });
}
