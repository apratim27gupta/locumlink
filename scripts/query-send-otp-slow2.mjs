import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();
const from = new Date('2026-09-21T00:00:00.000Z');
const to = new Date('2026-09-22T00:00:00.000Z');
const rows = await prisma.errorLog.findMany({
  where: {
    createdAt: { gte: from, lte: to },
    OR: [
      { message: { contains: 'SLOW_API', mode: 'insensitive' } },
      { message: { contains: 'send-otp', mode: 'insensitive' } },
    ],
  },
  orderBy: { createdAt: 'asc' },
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
