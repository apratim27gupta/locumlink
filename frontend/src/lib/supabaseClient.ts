import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
/** Fingerprint of url+anon so we recreate the client if env changes (e.g. dev restart / HMR). */
let cachedEnvFingerprint: string | null = null;

function readPublicSupabaseEnv(): { url: string; anon: string } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  return { url, anon };
}

/** True when env still uses template / placeholder values (not a real project or local CLI keys). */
export function isSupabasePlaceholderEnv(): boolean {
  const { url, anon } = readPublicSupabaseEnv();
  const placeholderAnon =
    /^your-supabase-anon-key$/i.test(anon) ||
    /^local-dev-anon-key$/i.test(anon);
  return url.includes('your-project-ref') || placeholderAnon;
}

/**
 * Lazy singleton: validates env at creation time and recreates the client if URL/key change.
 * Only runs in the browser — Supabase auth uses fetch to your project URL; do not call from RSC/SSR.
 */
export function getSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error(
      'getSupabase() must run in the browser (e.g. useEffect, event handlers). It cannot run during SSR.',
    );
  }

  const { url, anon } = readPublicSupabaseEnv();
  if (!url || !anon) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set both in frontend/.env.local (NEXT_PUBLIC_ prefix required) and restart Next.js.',
    );
  }
  if (isSupabasePlaceholderEnv()) {
    throw new Error(
      'Supabase env looks like a placeholder (e.g. local-dev-anon-key or http://127.0.0.1:54321 without real keys). Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local to your hosted project (Dashboard → Settings → API), or use the URL and anon key from `supabase status` if you run `supabase start`. In Next.js, `.env.development.local` overrides `.env.local` — remove or fix it if present. Stop and restart `next dev` after any change (NEXT_PUBLIC_* is baked in at startup).',
    );
  }

  const fingerprint = `${url}\0${anon}`;
  if (client && cachedEnvFingerprint === fingerprint) {
    return client;
  }

  client = createClient(url, anon);
  cachedEnvFingerprint = fingerprint;
  return client;
}

/** Maps Supabase client network failures to a clear, actionable message. */
export function formatSupabaseNetworkError(err: unknown): Error {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(not set)';
  const msg = err instanceof Error ? err.message : String(err);
  const looksLikeNetwork =
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      msg,
    );
  if (looksLikeNetwork) {
    const envHint = /127\.0\.0\.1:54321|localhost:54321/.test(baseUrl)
      ? ' If you expect hosted Supabase (https://….supabase.co) but see localhost here, check frontend/.env.development.local (it overrides .env.local), then fully stop and restart `next dev`.'
      : '';
    return new Error(
      `Cannot reach Supabase at ${baseUrl}. If you use the local stack, run \`supabase start\` and match URL/anon key to \`supabase status\`. For hosted Supabase, use your project URL from the dashboard.${envHint}`,
    );
  }
  if (err instanceof Error) return err;
  return new Error(msg);
}
