import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

let loaded = false;

/** Load DATABASE_URL, JWT, and GCS vars from frontend + backend env files. */
export function ensureAdminEnv(): void {
  if (loaded) return;
  loaded = true;

  const roots = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '../..'),
  ];

  for (const root of roots) {
    for (const file of ['.env.local', '.env', 'backend/.env']) {
      const path = resolve(root, file);
      if (existsSync(path)) loadEnv({ path, override: false });
    }
  }
}
