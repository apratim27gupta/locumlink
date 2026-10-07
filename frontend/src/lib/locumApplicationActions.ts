import type { MyApplication } from '@/lib/api';
import { isLocalPostingEndDatePassed } from '@/lib/localDateTime';

/** Posting no longer open (expired, completed, removed, or past end date). */
export function isPostingClosedForNewActivity(jp: {
  status?: string | null;
  isDeleted?: boolean;
  endDate?: string | null;
}): boolean {
  if (jp.isDeleted) return true;
  const st = (jp.status ?? '').toUpperCase();
  if (st === 'EXPIRED' || st === 'COMPLETED') return true;
  return isLocalPostingEndDatePassed(jp.endDate ?? null);
}

/** Omit withdrawn apps and stale applications on closed postings from My Applications. */
export function shouldHideFromLocumDashboard(
  app: MyApplication,
  ctx: {
    isUpcomingApplication: (a: MyApplication) => boolean;
    isOngoingApplication: (a: MyApplication) => boolean;
    isCompletedApplication: (a: MyApplication) => boolean;
  },
): boolean {
  if (app.status === 'WITHDRAWN') return true;
  if (
    ctx.isUpcomingApplication(app)
    || ctx.isOngoingApplication(app)
    || ctx.isCompletedApplication(app)
  ) {
    return false;
  }
  return isPostingClosedForNewActivity(app.jobPosting);
}

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
