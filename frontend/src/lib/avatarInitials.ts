/**
 * Two-letter avatar: first character of given name + first character of family name.
 * Falls back to parsing a full-name string, then legacy initials, then "N".
 */
export function computeAvatarInitials(
  firstName?: string | null,
  lastName?: string | null,
  legacy?: string | null,
): string {
  const f = (firstName ?? '').trim();
  const l = (lastName ?? '').trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();

  const raw = (legacy ?? '').trim();
  if (raw) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1) {
      const p = parts[0];
      if (p.length <= 2) return p.toUpperCase();
      return p.slice(0, 2).toUpperCase();
    }
  }

  if (f) return f.slice(0, 2).toUpperCase();
  if (l) return l.slice(0, 2).toUpperCase();
  return 'N';
}

/**
 * When Nest profile names are missing, derive initials from Supabase
 * `user_metadata.full_name` / `name`, or the email local-part (e.g. ada.lovelace@ → AL).
 */
export function initialsFromSupabaseUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const fullName =
    typeof meta.full_name === 'string'
      ? meta.full_name
      : typeof meta.name === 'string'
        ? meta.name
        : '';
  const fromMeta = fullName.trim();
  if (fromMeta) {
    const v = computeAvatarInitials(null, null, fromMeta);
    return v === 'N' ? null : v;
  }
  const email = user.email?.trim();
  if (!email) return null;
  const local = email.split('@')[0] ?? '';
  const normalized = local.replace(/[._+-]+/g, ' ').trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length === 1) {
    return parts[0].toUpperCase();
  }
  return null;
}
