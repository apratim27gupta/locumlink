export function relativeHoursOrDaysAgo(iso: string | null | undefined): string {
    if (!iso)
        return '—';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t))
        return '—';
    const diffMs = Date.now() - t;
    if (diffMs < 0)
        return 'Just now';
    const hoursTotal = Math.floor(diffMs / 3600000);
    if (hoursTotal < 24) {
        if (hoursTotal < 1)
            return 'Just now';
        return `${hoursTotal} hour${hoursTotal === 1 ? '' : 's'} ago`;
    }
    const days = Math.floor(diffMs / 86400000);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Prefer publish time over draft create time for “posted X ago”. */
export function jobPostedAtIso(job: {
  publishedAt?: string | null;
  createdAt?: string | null;
}): string | null {
  return job.publishedAt ?? job.createdAt ?? null;
}

export function toLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function toLocalTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function notifCategory(type: string): string {
  if (type === 'message') return 'messages';
  if (type === 'application' || type === 'shortlisted') return 'applications';
  if (type === 'reminder') return 'reminders';
  if (type === 'cancellation') return 'cancellations';
  return 'account';
}
