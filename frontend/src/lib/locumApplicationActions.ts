import type { MyApplication } from '@/lib/api';

/** Locum can change availability / withdraw until the posting is ongoing or finished. */
export function canMutateApplicationBeforeOngoing(app: {
  status: string;
  jobPosting?: { status?: string | null; isDeleted?: boolean } | null;
}): boolean {
  if (app.status === 'WITHDRAWN' || app.status === 'REJECTED') return false;
  const posting = app.jobPosting;
  if (!posting) return false;
  if (posting.isDeleted) return false;
  const st = (posting.status ?? '').toUpperCase();
  if (st === 'ONGOING' || st === 'COMPLETED' || st === 'EXPIRED') return false;
  return true;
}

export function applicationJobId(app: MyApplication): string | null {
  const id = app.jobPosting?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
