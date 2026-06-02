const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('[prisma-check] prisma-ok');
  } catch (e) {
    console.error('[prisma-check] prisma-failed');
    console.error(e?.message || String(e));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();

