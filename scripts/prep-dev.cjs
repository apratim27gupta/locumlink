/**
 * Best-effort Postgres via Docker. Dev servers still start if this fails
 * (e.g. Docker Desktop stopped) so `npm run dev` is not a silent no-op.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const schema = 'database/prisma/schema.prisma';

// Root prisma.config.ts reads DATABASE_URL from repo-root .env; dev env lives in backend/.env.
require('dotenv').config({ path: path.join(root, 'backend', '.env') });
require('dotenv').config({ path: path.join(root, '.env') });

try {
    execSync('docker compose up -d', { stdio: 'inherit', cwd: root, env: process.env });
}
catch {
    console.warn(
        '\n[prep-dev] docker compose up -d failed (Docker not running or compose error).',
        '\n[prep-dev] Ensure Postgres is up on DATABASE_URL, or start Docker and run: npm run db:up',
        '\n[prep-dev] Starting API + UI anyway…\n',
    );
}

try {
    execSync(`npx prisma migrate deploy --schema=${schema}`, {
        stdio: 'inherit',
        cwd: root,
        env: process.env,
    });
}
catch {
    console.warn(
        '\n[prep-dev] prisma migrate deploy failed.',
        '\n[prep-dev] Run: npm run db:prepare',
        '\n[prep-dev] Starting API + UI anyway…\n',
    );
}
