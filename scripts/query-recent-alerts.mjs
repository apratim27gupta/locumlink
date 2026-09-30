import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();
// 1:00 AM IST Sep 22, 2026 = 2026-09-21T19:30:00.000Z
const from = new Date('2026-09-21T19:00:00.000Z');
const to = new Date('2026-09-21T20:30:00.000Z');

const errors = await prisma.errorLog.findMany({
  where: { createdAt: { gte: from, lte: to } },
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    createdAt: true,
    message: true,
    route: true,
    statusCode: true,
    alerted: true,
  },
});

const emails = await prisma.emailLog.findMany({
  where: {
    createdAt: { gte: from, lte: to },
    recipient: { contains: 'aroradamini', mode: 'insensitive' },
  },
  orderBy: { createdAt: 'asc' },
  select: {
    createdAt: true,
    recipient: true,
    eventType: true,
    status: true,
    provider: true,
  },
});

console.log('--- error_logs ---');
console.log(JSON.stringify(errors, null, 2));
console.log('--- email_logs to aroradamini ---');
console.log(JSON.stringify(emails, null, 2));
await prisma.$disconnect();
