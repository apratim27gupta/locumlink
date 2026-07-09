import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getTestDb(): PrismaClient {
  if (!prisma) {
    const url =
      process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      '';
    if (!url) {
      throw new Error('TEST_DATABASE_URL is not configured');
    }
    prisma = new PrismaClient({
      datasources: { db: { url } },
    });
  }
  return prisma;
}

/** Truncate user-generated data between tests (order respects FK constraints). */
export async function cleanupTables(): Promise<void> {
  const db = getTestDb();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      message_attachments,
      messages,
      notification_events,
      applications,
      shifts,
      job_postings,
      documents,
      locum_profiles,
      host_profiles,
      audit_logs,
      push_subscriptions,
      expo_push_tokens,
      user_reports,
      user_blocks,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function disconnectTestDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
