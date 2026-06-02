import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Where `backend/package.json` lives, whether cwd is repo root `l2/` or workspace `l2/backend/`. */
export function resolveBackendRootDir(): string {
  const cwd = process.cwd();
  const nestedBackend = resolve(cwd, 'backend');
  if (existsSync(resolve(nestedBackend, 'package.json'))) return nestedBackend;
  if (existsSync(resolve(cwd, 'package.json'))) return cwd;
  return cwd;
}

/**
 * Load env files from the backend workspace in stable order so values stack correctly.
 *
 * Earlier files establish defaults; `{root}/.env.{NODE_ENV}` overlays (staging/prod previews).
 *
 * IMPORTANT: Previously only the **first existing** candidate was loaded, so `.env.staging`
 * masked everything in `.env`, which broke `GOOGLE_ADMIN_*` saved only there.
 *
 * `@nestjs/config` merges later paths over earlier paths for overlapping keys only.
 */
export function backendDevelopmentEnvPaths(): string[] {
  const nodeEnv =
    typeof process.env.NODE_ENV === 'string' && process.env.NODE_ENV.trim()
      ? process.env.NODE_ENV.trim()
      : 'development';
  const root = resolveBackendRootDir();
  const parent = resolve(root, '..');
  const candidates = [
    // Repo root env (Prisma CLI + shared scripts typically load this)
    resolve(parent, '.env'),
    resolve(parent, `.env.${nodeEnv}`),
    resolve(parent, '.env.local'),
    // Backend-specific env overlays
    resolve(root, '.env'),
    resolve(root, `.env.${nodeEnv}`),
    resolve(root, '.env.local'),
  ];
  return candidates.filter((p) => existsSync(p));
}
