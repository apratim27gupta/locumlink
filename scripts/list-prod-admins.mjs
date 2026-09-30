import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();
const admins = await prisma.admin.findMany({ select: { email: true, name: true } });
for (const a of admins) console.log(`${a.email}\t${a.name}`);
await prisma.$disconnect();
