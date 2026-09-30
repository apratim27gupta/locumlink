import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();
const from = new Date('2026-09-19T00:00:00.000Z');

const emails = await prisma.emailLog.findMany({
  where: {
    sentAt: { gte: from },
    recipient: { contains: 'aroradamini', mode: 'insensitive' },
  },
  orderBy: { sentAt: 'desc' },
  take: 20,
});

const slow = await prisma.errorLog.findMany({
  where: { createdAt: { gte: from }, message: { contains: 'SLOW_API' } },
  orderBy: { createdAt: 'desc' },
  take: 10,
  select: { createdAt: true, message: true, alerted: true },
});

const alerted = await prisma.errorLog.findMany({
  where: { createdAt: { gte: from }, alerted: true },
  orderBy: { createdAt: 'desc' },
  take: 15,
  select: { createdAt: true, message: true, route: true },
});

console.log(JSON.stringify({ emails, slow, alerted }, null, 2));
await prisma.$disconnect();
