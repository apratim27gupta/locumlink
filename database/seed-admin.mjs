import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load backend env (contains DATABASE_URL on this repo)
loadEnv({ path: new URL('../backend/.env', import.meta.url) });

const email = (process.env.ADMIN_SEED_EMAIL || '').trim().toLowerCase();
const name = (process.env.ADMIN_SEED_NAME || 'Admin').trim();

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Ensure backend/.env contains DATABASE_URL.');
  process.exit(1);
}
if (!email) {
  console.error('Missing ADMIN_SEED_EMAIL. Example: ADMIN_SEED_EMAIL="admin@yourcompany.com"');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const admin = await prisma.admin.upsert({
    where: { email },
    update: { name, role: 'admin' },
    create: { email, name, role: 'admin' },
  });
  console.log(`Seeded admin: ${admin.email} (${admin.id})`);
} finally {
  await prisma.$disconnect();
}

