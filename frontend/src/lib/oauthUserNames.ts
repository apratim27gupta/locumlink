import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabaseClient';

export type OAuthUserNames = {
  firstName: string;
  lastName: string;
  /** Supabase auth provider id, e.g. apple, google, azure. */
  provider: string | null;
};

function readString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === 'string' ? v.trim() : '';
}

function readNestedAppleName(meta: Record<string, unknown>): {
  firstName: string;
  lastName: string;
} {
  const name = meta.name;
  if (!name || typeof name !== 'object') return { firstName: '', lastName: '' };
  const record = name as Record<string, unknown>;
  const firstName =
    readString(record, 'firstName')
    || readString(record, 'givenName')
    || readString(record, 'given_name');
  const lastName =
    readString(record, 'lastName')
    || readString(record, 'familyName')
    || readString(record, 'family_name');
  return { firstName, lastName };
}

export type AppleJsUser = {
  name?: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
  } | null;
  email?: string | null;
};

/** Save Apple-provided name to Supabase user metadata (first sign-in only). */
export async function persistAppleNameFromAppleJsUser(
  appleUser: AppleJsUser | null | undefined,
): Promise<void> {
  const firstName = appleUser?.name?.firstName?.trim() ?? '';
  const lastName = appleUser?.name?.lastName?.trim() ?? '';
  if (!firstName) return;

  const supabase = getSupabase();
  const fullName = [firstName, appleUser?.name?.middleName, lastName]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join(' ');

  const { error } = await supabase.auth.updateUser({
    data: {
      given_name: firstName,
      family_name: lastName,
      full_name: fullName,
    },
  });
  if (error) {
    console.warn('[oauth] could not persist Apple name metadata:', error.message);
  }
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Parse display name from Supabase OAuth user metadata.
 *
 * Typical fields by provider (first sign-in only for Apple):
 * - Apple: user_metadata.full_name, given_name, family_name
 * - Google: user_metadata.full_name, name
 * - Azure: user_metadata.full_name, given_name, family_name, name
 */
export function parseOAuthUserNames(user: User | null | undefined): OAuthUserNames | null {
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let firstName = readString(meta, 'given_name');
  let lastName = readString(meta, 'family_name');

  if (!firstName) {
    const nested = readNestedAppleName(meta);
    firstName = nested.firstName;
    lastName = lastName || nested.lastName;
  }

  if (!firstName) {
    const fullName =
      readString(meta, 'full_name')
      || readString(meta, 'name');
    if (fullName) {
      const split = splitFullName(fullName);
      firstName = split.firstName;
      lastName = lastName || split.lastName;
    }
  }

  if (!firstName) {
    for (const identity of user.identities ?? []) {
      const data = (identity.identity_data ?? {}) as Record<string, unknown>;
      firstName = readString(data, 'given_name');
      lastName = lastName || readString(data, 'family_name');
      if (!firstName) {
        const full =
          readString(data, 'full_name')
          || readString(data, 'name');
        if (full) {
          const split = splitFullName(full);
          firstName = split.firstName;
          lastName = lastName || split.lastName;
        }
      }
      if (firstName) break;
    }
  }

  if (!firstName) return null;

  const provider =
    user.app_metadata?.provider
    ?? user.identities?.[0]?.provider
    ?? null;

  return {
    firstName,
    lastName,
    provider: typeof provider === 'string' ? provider : null,
  };
}

/** Load OAuth-provided names from the active Supabase browser session. */
export async function fetchOAuthUserNamesFromSession(): Promise<OAuthUserNames | null> {
  if (typeof window === 'undefined') return null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const names = parseOAuthUserNames(data.user);
    if (!names && process.env.NODE_ENV === 'development') {
      console.info('[oauth] no name in Supabase user metadata', {
        user_metadata: data.user.user_metadata,
        identity_data: data.user.identities?.map((id) => id.identity_data),
        provider: data.user.app_metadata?.provider,
      });
    }
    return names;
  } catch {
    return null;
  }
}
