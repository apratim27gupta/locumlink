import { contactSupportMailtoHref } from './notification-copy.js';

export type NotificationActionDefaults = {
  href: string;
  actionLabel: string;
};

/** Fallback href + action when older rows lack payload fields. */
export const NOTIFICATION_EVENT_DEFAULTS: Record<
  string,
  NotificationActionDefaults
> = {
  H_001_LOCUM_APPLIED: {
    href: '/host/dashboard',
    actionLabel: 'Review Application',
  },
  H_002_LOCUM_ACCEPTED: {
    href: '/host/dashboard',
    actionLabel: 'View Shift Details',
  },
  H_003_LOCUM_DECLINED: {
    href: '/host/dashboard',
    actionLabel: 'Repost Opportunity',
  },
  H_004_NEW_MESSAGE: {
    href: '/host/messages',
    actionLabel: 'Read Message',
  },
  H_005_ACCOUNT_VERIFIED: {
    href: '/host/dashboard?postJob=1',
    actionLabel: 'Post Your First Opportunity',
  },
  H_006_ACCOUNT_REJECTED: {
    href: '/host/profile',
    actionLabel: 'Complete Verification',
  },
  H_007_ACCOUNT_SUSPENDED: {
    href: contactSupportMailtoHref(),
    actionLabel: 'Contact Support',
  },
  H_008_POSTING_EXPIRING: {
    href: '/host/dashboard',
    actionLabel: 'Extend Opportunity',
  },
  H_009_SHIFT_CANCELLED: {
    href: '/host/dashboard?postJob=1',
    actionLabel: 'Repost Opportunity',
  },
  H_010_ACCOUNT_WARNING: {
    href: contactSupportMailtoHref(),
    actionLabel: 'Contact Support',
  },
  H_011_PROFILE_REMINDER: {
    href: '/host/profile',
    actionLabel: 'Complete Profile',
  },
  H_012_JOB_POSTED: {
    href: '/host/dashboard',
    actionLabel: 'View Posting',
  },
  H_013_AVAILABILITY_UPDATED: {
    href: '/host/dashboard',
    actionLabel: 'Review Applicants',
  },
  H_014_MATCH_FEE_INVOICED: {
    href: '/host/invoices',
    actionLabel: 'View Invoice',
  },
  H_015_MATCH_FEE_DUE_SOON: {
    href: '/host/invoices',
    actionLabel: 'Pay Match Fee',
  },
  H_016_MATCH_FEE_OVERDUE: {
    href: '/host/invoices',
    actionLabel: 'Pay Match Fee',
  },
  H_017_MATCH_FEE_PAID: {
    href: '/host/invoices',
    actionLabel: 'View Receipt',
  },
  H_018_MATCH_FEE_REFUND: {
    href: '/host/invoices',
    actionLabel: 'View Invoice',
  },
  H_019_MATCH_FEE_CANCELLED: {
    href: '/host/invoices',
    actionLabel: 'View Invoice',
  },
  L_001_NEW_OPPORTUNITY: {
    href: '/locum/browse',
    actionLabel: 'Browse Opportunities',
  },
  L_002_HOST_CONFIRMED: {
    href: '/locum/dashboard',
    actionLabel: 'View Shift Details',
  },
  L_003_APPLICATION_ACCEPTED: {
    href: '/locum/dashboard',
    actionLabel: 'Confirm Availability',
  },
  L_004_APPLICATION_DECLINED: {
    href: '/locum/browse',
    actionLabel: 'Browse Opportunities',
  },
  L_005_SHIFT_REMINDER_48H: {
    href: '/locum/dashboard',
    actionLabel: 'View Schedule',
  },
  L_006_SHIFT_REMINDER_EVENING: {
    href: '/locum/dashboard',
    actionLabel: 'View Shift Details',
  },
  L_007_SHIFT_REMINDER_2H: {
    href: '/locum/dashboard',
    actionLabel: 'View Shift',
  },
  L_008_NEW_MESSAGE: {
    href: '/locum/messages',
    actionLabel: 'Reply',
  },
  L_009_ACCOUNT_VERIFIED: {
    href: '/locum/browse',
    actionLabel: 'Browse Opportunities',
  },
  L_010_ACCOUNT_REJECTED: {
    href: '/locum/profile',
    actionLabel: 'Complete Verification',
  },
  L_011_ACCOUNT_SUSPENDED: {
    href: contactSupportMailtoHref(),
    actionLabel: 'Contact Support',
  },
  L_012_SHIFT_CANCELLED: {
    href: '/locum/browse',
    actionLabel: 'Browse Opportunities',
  },
  L_013_ACCOUNT_WARNING: {
    href: contactSupportMailtoHref(),
    actionLabel: 'Contact Support',
  },
  L_014_PROFILE_REMINDER: {
    href: '/locum/profile',
    actionLabel: 'Complete Profile',
  },
  L_015_MATCH_FEE_INFO: {
    href: '/locum/dashboard',
    actionLabel: 'View Dashboard',
  },
  U_001_ADMIN_MESSAGE: {
    href: '/locum/dashboard',
    actionLabel: 'Open dashboard',
  },
};

/** Fallback in-app titles when payload.title is missing or an internal event code. */
export const NOTIFICATION_EVENT_TITLES: Record<string, string> = {
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
  H_011_PROFILE_REMINDER: 'Complete your Locum Link profile',
  H_012_JOB_POSTED: 'Job posted',
  H_013_AVAILABILITY_UPDATED: 'Availability updated',
  H_014_MATCH_FEE_INVOICED: 'Match fee invoice due',
  H_015_MATCH_FEE_DUE_SOON: 'Match fee due soon',
  H_016_MATCH_FEE_OVERDUE: 'Match fee overdue',
  H_017_MATCH_FEE_PAID: 'Match fee received',
  H_018_MATCH_FEE_REFUND: 'Match fee refund',
  H_019_MATCH_FEE_CANCELLED: 'Match fee updated after cancellation',
  L_001_NEW_OPPORTUNITY: 'New Locum Opportunity Available',
  L_002_HOST_CONFIRMED: 'Shift Confirmed',
  L_003_APPLICATION_ACCEPTED: 'Application Shortlisted',
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
  L_014_PROFILE_REMINDER: 'Complete your Locum Link profile',
  L_015_MATCH_FEE_INFO: 'Placement confirmed',
  U_001_ADMIN_MESSAGE: 'Message from Locum Link',
};

function isInternalNotificationCode(text: string): boolean {
  return /^[HLAU]_\d{3}_/i.test(text.trim());
}

export function resolveNotificationTitle(
  eventType: string,
  payloadTitle?: string,
): string {
  const raw = payloadTitle?.trim();
  if (raw && !isInternalNotificationCode(raw)) return raw;
  return NOTIFICATION_EVENT_TITLES[eventType] ?? 'Notification';
}

export function resolveNotificationActionFields(
  eventType: string,
  payload: { href?: string; actionLabel?: string },
): NotificationActionDefaults {
  const defaults = NOTIFICATION_EVENT_DEFAULTS[eventType];
  const href = payload.href?.trim();
  const actionLabel = payload.actionLabel?.trim();
  return {
    href: href && href !== '/' ? href : (defaults?.href ?? '/'),
    actionLabel: actionLabel || defaults?.actionLabel || 'View',
  };
}
