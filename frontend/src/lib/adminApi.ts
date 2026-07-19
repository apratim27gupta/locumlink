'use client';

const nestApiBase = () =>
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * API base for admin requests.
 * In the browser we use the same origin (e.g. :3002) so `/api/*` rewrites to Nest and the
 * `ll_admin` cookie stays on one host. Server components use NEXT_PUBLIC_API_URL.
 */
export function adminApiBase(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return nestApiBase();
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.message !== undefined && typeof j.message === 'string') return j.message;
    if (Array.isArray(j?.message))
      return j.message.join(', ');
    if (j?.error !== undefined && typeof j.error === 'string') return j.error;
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

export type AdminNotificationItem = {
  id: string;
  type: 'registration' | 'credential' | 'flagged';
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL';
  actionLabel?: string;
  eventType?: string;
};

export async function adminGetNotifications(): Promise<{
  total: number;
  notifications: AdminNotificationItem[];
}> {
  return adminFetchJson('/api/admin/notifications');
}

export async function adminMarkNotificationRead(id: string): Promise<void> {
  await adminFetchJson(`/api/admin/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
  });
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

export type AdminReportStatus = 'OPEN' | 'DISMISSED' | 'WARNED' | 'SUSPENDED';
export type AdminReportReason = 'HARASSMENT' | 'SPAM' | 'INAPPROPRIATE_CONTENT' | 'FRAUD' | 'OTHER';

export type AdminReportUser = {
  id: string;
  email: string;
  role: 'HOST' | 'LOCUM' | 'ADMIN';
  status: string;
  name: string;
};

export type AdminReportRow = {
  id: string;
  reason: AdminReportReason;
  details: string | null;
  status: AdminReportStatus;
  alsoBlockedReporter: boolean;
  createdAt: string;
  reviewedAt: string | null;
  warningNote: string | null;
  reporter: AdminReportUser;
  reported: AdminReportUser;
  reviewedBy?: { id: string; email: string; name: string } | null;
};

export type AdminReportDetail = AdminReportRow & {
  messages: Array<{
    id: string;
    senderId: string;
    recipientId: string;
    body: string;
    sentAt: string;
    editedAt: string | null;
    attachments: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }>;
};

export async function adminListFeedback(): Promise<{
  items: Array<{
    id: string;
    message: string;
    createdAt: string;
    user: {
      id: string;
      email: string;
      role: string;
      name: string;
    };
  }>;
}> {
  return adminFetchJson('/api/admin/feedback');
}

export async function adminListReports(status: AdminReportStatus = 'OPEN'): Promise<{ items: AdminReportRow[] }> {
  return adminFetchJson(`/api/admin/reports?${new URLSearchParams({ status }).toString()}`);
}

export async function adminGetReport(id: string): Promise<AdminReportDetail> {
  return adminFetchJson(`/api/admin/reports/${encodeURIComponent(id)}`);
}

export async function adminActionReport(
  id: string,
  body:
    | { action: 'DISMISS' }
    | { action: 'WARN'; warningNote: string }
    | { action: 'SUSPEND'; suspensionNote: string },
): Promise<AdminReportDetail> {
  return adminFetchJson(`/api/admin/reports/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
