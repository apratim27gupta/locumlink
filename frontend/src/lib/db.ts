import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ensureAdminEnv } from '@/lib/ensure-admin-env';
const globalForPrisma = global as unknown as {
    prisma?: PrismaClient;
};
export function getDb(): PrismaClient {
    if (globalForPrisma.prisma)
        return globalForPrisma.prisma;
    ensureAdminEnv();
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL must be set for API routes that use Prisma (e.g. /api/host/profile)');
    }
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });
    globalForPrisma.prisma = prisma;
    return prisma;
}
