import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();
const rows = await prisma.errorLog.findMany({
  where: { message: { contains: 'SLOW_API', mode: 'insensitive' } },
  orderBy: { createdAt: 'desc' },
  take: 15,
  select: { createdAt: true, message: true, route: true, statusCode: true, alerted: true },
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
