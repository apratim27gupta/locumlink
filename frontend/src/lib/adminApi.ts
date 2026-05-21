'use client';

const nestApiBase = () =>
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * API base for admin requests.
 * In the browser we use the same origin (e.g. :3002) so `/api/*` rewrites to Nest and the
 * `ll_admin` cookie from OAuth stays on one host. Server components use NEXT_PUBLIC_API_URL.
 */
export function adminApiBase(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return nestApiBase();
}

/** Shown on admin login — must match GOOGLE_ADMIN_CALLBACK_URL in backend/.env and Google Cloud. */
export function adminGoogleOAuthCallbackUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ADMIN_OAUTH_CALLBACK_URL?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/admin-auth/google/callback`;
  }
  return `${nestApiBase()}/api/admin-auth/google/callback`;
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.message !== undefined && typeof j.message === 'string') return j.message;
    if (Array.isArray(j?.message))
      return j.message.join(', ');
  }
    catch {}
  try {
    return await res.text();
  }
 catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function adminFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${adminApiBase()}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function adminDownloadUsersCsv(q: string): Promise<void> {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set('q', q.trim());
  const res = await fetch(
    `${adminApiBase()}/api/admin/users/export?${qs.toString()}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'users.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function adminDownloadAnalyticsReport(): Promise<void> {
  const res = await fetch(`${adminApiBase()}/api/admin/analytics/export`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `locumlink-analytics-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
