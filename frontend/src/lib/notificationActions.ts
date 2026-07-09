import type { NotificationItem } from '@/lib/api';
import { SUPPORT_PAGE_PATH } from '@/lib/support';

const EVENT_DEFAULTS: Record<string, { href: string; actionLabel: string }> = {
  H_001_LOCUM_APPLIED: { href: '/host/dashboard', actionLabel: 'Review Application' },
  H_002_LOCUM_ACCEPTED: { href: '/host/dashboard', actionLabel: 'View Shift Details' },
  H_003_LOCUM_DECLINED: { href: '/host/dashboard', actionLabel: 'Repost Opportunity' },
  H_004_NEW_MESSAGE: { href: '/host/messages', actionLabel: 'Read Message' },
  H_005_ACCOUNT_VERIFIED: { href: '/host/dashboard?postJob=1', actionLabel: 'Post Your First Opportunity' },
  H_006_ACCOUNT_REJECTED: { href: '/host/profile', actionLabel: 'Complete Verification' },
  H_007_ACCOUNT_SUSPENDED: { href: SUPPORT_PAGE_PATH, actionLabel: 'Contact Support' },
  H_008_POSTING_EXPIRING: { href: '/host/dashboard', actionLabel: 'Extend Opportunity' },
  H_009_SHIFT_CANCELLED: { href: '/host/dashboard?postJob=1', actionLabel: 'Repost Opportunity' },
  H_010_ACCOUNT_WARNING: { href: SUPPORT_PAGE_PATH, actionLabel: 'Contact Support' },
  L_001_NEW_OPPORTUNITY: { href: '/locum/browse', actionLabel: 'Browse Opportunities' },
  L_002_HOST_CONFIRMED: { href: '/locum/dashboard', actionLabel: 'View Shift Details' },
  L_003_APPLICATION_ACCEPTED: { href: '/locum/dashboard', actionLabel: 'Confirm Availability' },
  L_004_APPLICATION_DECLINED: { href: '/locum/browse', actionLabel: 'Browse Opportunities' },
  L_005_SHIFT_REMINDER_48H: { href: '/locum/dashboard', actionLabel: 'View Schedule' },
  L_006_SHIFT_REMINDER_EVENING: { href: '/locum/dashboard', actionLabel: 'View Shift Details' },
  L_007_SHIFT_REMINDER_2H: { href: '/locum/dashboard', actionLabel: 'View Shift' },
  L_008_NEW_MESSAGE: { href: '/locum/messages', actionLabel: 'Reply' },
  L_009_ACCOUNT_VERIFIED: { href: '/locum/browse', actionLabel: 'Browse Opportunities' },
  L_010_ACCOUNT_REJECTED: { href: '/locum/profile', actionLabel: 'Complete Verification' },
  L_011_ACCOUNT_SUSPENDED: { href: SUPPORT_PAGE_PATH, actionLabel: 'Contact Support' },
  L_012_SHIFT_CANCELLED: { href: '/locum/browse', actionLabel: 'Browse Opportunities' },
  L_013_ACCOUNT_WARNING: { href: SUPPORT_PAGE_PATH, actionLabel: 'Contact Support' },
};

const EVENT_TITLES: Record<string, string> = {
  H_001_LOCUM_APPLIED: 'New Application',
  H_002_LOCUM_ACCEPTED: 'Shift Confirmed',
  H_003_LOCUM_DECLINED: 'Application Update',
  H_004_NEW_MESSAGE: 'New Message',
  H_005_ACCOUNT_VERIFIED: 'Account Verified - Welcome to Locum Link!',
  H_006_ACCOUNT_REJECTED: 'Action Required: Account Verification',
  H_007_ACCOUNT_SUSPENDED: 'Important: Account Suspension Notice',
  H_008_POSTING_EXPIRING: 'Shift Coverage Reminder',
  H_009_SHIFT_CANCELLED: 'Last-Minute Cancellation Alert',
  H_010_ACCOUNT_WARNING: 'Account warning',
  L_001_NEW_OPPORTUNITY: 'New Locum Opportunity Available',
  L_002_HOST_CONFIRMED: 'Shift Confirmed',
  L_003_APPLICATION_ACCEPTED: 'Application Accepted — Action Required',
  L_004_APPLICATION_DECLINED: 'Application Update',
  L_005_SHIFT_REMINDER_48H: 'Upcoming Shift Reminder',
  L_006_SHIFT_REMINDER_EVENING: "Tomorrow's Shift Reminder",
  L_007_SHIFT_REMINDER_2H: 'Shift Starting Soon',
  L_008_NEW_MESSAGE: 'New Message',
  L_009_ACCOUNT_VERIFIED: 'Account Verified - Start Finding Shifts!',
  L_010_ACCOUNT_REJECTED: 'Action Required: Account Verification',
  L_011_ACCOUNT_SUSPENDED: 'Account suspended',
  L_012_SHIFT_CANCELLED: 'Shift Cancelled',
  L_013_ACCOUNT_WARNING: 'Account warning',
};

const SUPPORT_EVENT_TYPES = new Set([
  'H_007_ACCOUNT_SUSPENDED',
  'H_010_ACCOUNT_WARNING',
  'L_011_ACCOUNT_SUSPENDED',
  'L_013_ACCOUNT_WARNING',
]);

function isInternalNotificationCode(text: string): boolean {
  return /^[HLA]_\d{3}_/i.test(text.trim());
}

export function resolveNotificationTitle(notif: NotificationItem): string {
  const raw = notif.title?.trim();
  if (raw && !isInternalNotificationCode(raw)) return raw;
  const eventType = notif.eventType?.trim() ?? '';
  if (eventType && EVENT_TITLES[eventType]) return EVENT_TITLES[eventType];
  return 'Notification';
}

export function resolveNotificationAction(notif: NotificationItem): {
  href: string | null;
  actionLabel: string | null;
} {
  const eventType = notif.eventType?.trim() ?? '';
  const defaults = eventType ? EVENT_DEFAULTS[eventType] : undefined;
  const rawHref = notif.href?.trim();
  const href =
    SUPPORT_EVENT_TYPES.has(eventType)
      ? defaults?.href ?? SUPPORT_PAGE_PATH
      : eventType === 'H_002_LOCUM_ACCEPTED' || eventType === 'H_003_LOCUM_DECLINED'
      ? defaults?.href ?? '/host/dashboard'
      : rawHref && rawHref !== '/'
        ? rawHref
        : defaults?.href ?? null;
  const actionLabel =
    notif.actionLabel?.trim() || defaults?.actionLabel || null;
  return { href, actionLabel };
}

export function isExternalNotificationHref(href: string): boolean {
  return /^mailto:/i.test(href) || /^https?:\/\//i.test(href);
}
