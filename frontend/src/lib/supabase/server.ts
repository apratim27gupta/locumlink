import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
function readSupabaseEnv(): {
  url: string;
  anon: string;
} {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
    || (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  return { url, anon };
}
export async function createClient(): Promise<SupabaseClient> {
  const { url, anon } = readSupabaseEnv();
  if (!url || !anon) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).',
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
