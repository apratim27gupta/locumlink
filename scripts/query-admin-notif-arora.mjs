import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();
const from = new Date('2026-09-15T00:00:00.000Z');
const rows = await prisma.adminNotificationEvent.findMany({
  where: {
    sentAt: { gte: from },
    admin: { email: { contains: 'aroradamini', mode: 'insensitive' } },
  },
  orderBy: { sentAt: 'desc' },
  take: 20,
  include: { admin: { select: { email: true } } },
});
console.log(JSON.stringify(rows.map((r) => ({ sentAt: r.sentAt, eventType: r.eventType, payload: r.payload })), null, 2));
await prisma.$disconnect();
