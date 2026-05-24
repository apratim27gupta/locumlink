import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | null = null;
let cachedEnvFingerprint: string | null = null;
function readPublicSupabaseEnv(): { url: string; anon: string } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
    || (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  return { url, anon };
}
export function isSupabasePlaceholderEnv(): boolean {
  const { url, anon } = readPublicSupabaseEnv();
  const placeholderAnon =
    /^your-supabase-anon-key$/i.test(anon) ||
    /^local-dev-anon-key$/i.test(anon);
  return url.includes('your-project-ref') || placeholderAnon;
}
export function createClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('createClient() must run in the browser.');
  }
  const { url, anon } = readPublicSupabaseEnv();
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  if (isSupabasePlaceholderEnv()) {
    throw new Error('Supabase env looks like a placeholder.');
  }
  const fingerprint = `${url}\0${anon}`;
  if (client && cachedEnvFingerprint === fingerprint) {
    return client;
  }
  client = createBrowserClient(url, anon, {
    auth: {
      flowType: 'pkce',
    },
  });
  cachedEnvFingerprint = fingerprint;
  return client;
}
export const getSupabase = createClient;
export function formatSupabaseNetworkError(err: unknown): Error {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(not set)';
  const msg =
    err instanceof Error ? err.message
    : typeof err === 'object' && err !== null && 'message' in err
      && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err);
  const looksLikeNetwork =
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
  if (looksLikeNetwork) {
    return new Error(`Cannot reach Supabase at ${baseUrl}.`);
  }
  if (err instanceof Error) return err;
  return new Error(msg);
}
export function toReadableAuthError(err: unknown): Error {
  const asError =
    err instanceof Error ? err
    : typeof err === 'object' && err !== null && 'message' in err
      && typeof (err as { message: unknown }).message === 'string'
      ? new Error((err as { message: string }).message)
      : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  return formatSupabaseNetworkError(asError);
}
