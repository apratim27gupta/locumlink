import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();

// Sep 22, 2026 00:30–01:30 IST ≈ Sep 21 19:00–20:00 UTC
const from = new Date('2026-09-21T19:00:00.000Z');
const to = new Date('2026-09-21T20:00:00.000Z');

const emails = await prisma.emailLog.findMany({
  where: {
    sentAt: { gte: from, lte: to },
    recipient: { contains: 'aroradamini', mode: 'insensitive' },
  },
  orderBy: { sentAt: 'asc' },
});

const errors = await prisma.errorLog.findMany({
  where: { createdAt: { gte: from, lte: to } },
  orderBy: { createdAt: 'asc' },
  select: { createdAt: true, message: true, route: true, statusCode: true, alerted: true },
});

const adminEvents = await prisma.adminNotificationEvent.findMany({
  where: { sentAt: { gte: from, lte: to } },
  orderBy: { sentAt: 'asc' },
  include: { admin: { select: { email: true } } },
  take: 50,
});

console.log('window_utc', from.toISOString(), 'to', to.toISOString());
console.log('email_logs', JSON.stringify(emails, null, 2));
console.log('error_logs', JSON.stringify(errors, null, 2));
console.log(
  'admin_notifications',
  JSON.stringify(
    adminEvents.map((e) => ({
      sentAt: e.sentAt,
      eventType: e.eventType,
      adminEmail: e.admin.email,
    })),
    null,
    2,
  ),
);
await prisma.$disconnect();
