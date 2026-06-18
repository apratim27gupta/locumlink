import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: new URL('../backend/.env', import.meta.url) });

const DEFAULT_ADMINS = [
  { email: 'admin@locumlink.ca', name: 'Locum Link Admin' },
  { email: 'info@aebeolleconsulting.com', name: 'Aebeolle Admin' },
];

function parseAdminsFromEnv() {
  const raw = (process.env.ADMIN_SEED_EMAILS || '').trim();
  if (!raw) return DEFAULT_ADMINS;

  return raw.split(',').map((part) => {
    const [emailPart, ...nameParts] = part.split(':');
    const email = (emailPart || '').trim().toLowerCase();
    const name = nameParts.join(':').trim() || 'Admin';
    return { email, name };
  }).filter((a) => a.email);
}

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Ensure backend/.env contains DATABASE_URL.');
  process.exit(1);
}

const adminsToSeed = parseAdminsFromEnv();
if (adminsToSeed.length === 0) {
  console.error('No admin emails to seed.');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  for (const { email, name } of adminsToSeed) {
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      console.log(`Admin already exists (unchanged): ${existing.email} (${existing.id})`);
      continue;
    }
    const admin = await prisma.admin.create({
      data: { email, name, role: 'admin' },
    });
    console.log(`Created admin: ${admin.email} (${admin.id})`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
