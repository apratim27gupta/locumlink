import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();
const from = new Date('2026-09-21T19:30:00.000Z');
const to = new Date('2026-09-21T19:50:00.000Z');
const rows = await prisma.errorLog.findMany({
  where: {
    createdAt: { gte: from, lte: to },
    message: { contains: 'send-otp', mode: 'insensitive' },
  },
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    createdAt: true,
    message: true,
    method: true,
    route: true,
    statusCode: true,
    alerted: true,
  },
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
