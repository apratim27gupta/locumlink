import { formatJobDate } from './notification-copy.js';

export type HostCopyPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL' | 'LOW';

export function formatHostDoctorName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name ? `Dr. ${name}` : 'Doctor';
}

export function hostMessagesHref(partnerId: string): string {
  return `/host/messages?partnerId=${encodeURIComponent(partnerId)}`;
}

/** H-001 — Locum applied to posting */
export function buildH001LocumApplied(params: {
  locumName: string;
  jobTitle: string;
  dateStr: string;
}) {
  const when = params.dateStr ? ` on ${params.dateStr}` : '';
  const emailSubject = params.dateStr
      ? `New Application for Your ${params.dateStr} Locum Shift`
      : 'New Application for Your Locum Shift';
  return {
    inAppTitle: emailSubject,
    inAppBody: `${params.locumName} has applied for your ${params.jobTitle} opportunity${when}. Review application now.`,
    emailSubject,
    emailBody: `${params.locumName} has applied for your ${params.jobTitle} opportunity${when}. Review application now. Review their profile and credentials.`,
    priority: 'MEDIUM' as HostCopyPriority,
    actionLabel: 'Review Application',
  };
}

/** H-002 — Locum accepted confirmed shift */
export function buildH002LocumAccepted(params: {
  locumName: string;
  dateStr: string;
}) {
  const when = params.dateStr || 'your scheduled date';
  const emailSubject = `Shift Confirmed: ${params.locumName} - ${when}`;
  return {
    inAppTitle: 'Shift Confirmed',
    inAppBody: `Confirmed! ${params.locumName} has accepted your ${when} locum shift.`,
    emailSubject,
    emailBody: `Great news! ${params.locumName} has accepted your ${when} locum shift. You can now coordinate shift details and clinic access.`,
    priority: 'HIGH' as HostCopyPriority,
    actionLabel: 'View Shift Details',
  };
}

/** H-003 — Locum declined opportunity */
export function buildH003LocumDeclined(params: {
  locumName: string;
  dateStr: string;
}) {
  const when = params.dateStr || 'the scheduled date';
  const emailSubject = `Application Update: ${when} Shift`;
  return {
    inAppTitle: 'Application Update',
    inAppBody: `${params.locumName} has declined your opportunity for ${when}. Browse other available locums.`,
    emailSubject,
    emailBody: `${params.locumName} has declined your locum opportunity for ${when}. We recommend reviewing other applicants or browsing available locum physicians in your area.`,
    priority: 'CRITICAL' as HostCopyPriority,
    actionLabel: 'Repost Opportunity',
  };
}

/** H-004 — New message from locum */
export function buildH004NewMessage(params: {
  locumName: string;
  jobTitle: string;
}) {
  const about = params.jobTitle ? ` regarding ${params.jobTitle}` : '';
  const emailSubject = `Message from ${params.locumName}`;
  return {
    inAppTitle: 'New Message',
    inAppBody: `You have a new message from ${params.locumName}${about}.`,
    emailSubject,
    emailBody: `${params.locumName} has sent you a message about ${params.jobTitle || 'your posting'}. Read and respond.`,
    priority: 'MEDIUM' as HostCopyPriority,
    actionLabel: 'Read Message',
  };
}

/** H-005 — Host account verified */
export const H005_HOST_ACCOUNT_VERIFIED = {
  inAppTitle: 'Account Verified - Welcome to LocumLink L2!',
  inAppBody:
    'Welcome to LocumLink L2! Your account has been verified. You can now post locum opportunities.',
  emailSubject: 'Account Verified - Welcome to LocumLink L2!',
  emailBody: (hostName: string) =>
    `Congratulations ${hostName}! Your credentials have been verified. You can begin posting locum opportunities to connect with qualified physicians in Nova Scotia.`,
  priority: 'HIGH' as HostCopyPriority,
  actionLabel: 'Post Your First Opportunity',
  postJobHref: '/host/post-job',
};

/** H-006 — Host verification rejected */
export const H006_HOST_VERIFICATION_REJECTED = {
  inAppTitle: 'Action Required: Account Verification',
  inAppBody: 'Account verification incomplete. Additional documentation required.',
  emailSubject: 'Action Required: Account Verification',
  emailBody: (hostName: string, reason: string) =>
    `Hello ${hostName}, We need additional information to complete your account verification. Reason: ${reason}. Please upload the required documents to proceed.`,
  priority: 'CRITICAL' as HostCopyPriority,
  actionLabel: 'Complete Verification',
  profileHref: '/host/profile',
};

/** H-007 — Host account suspended */
export const H007_HOST_ACCOUNT_SUSPENDED = {
  inAppTitle: 'Important: Account Suspension Notice',
  inAppBody: 'Your account has been suspended. Contact support for assistance.',
  emailSubject: 'Important: Account Suspension Notice',
  emailBody: (reason: string) =>
    `Your LocumLink L2 account has been suspended due to ${reason}. Please contact our support team to resolve this issue.`,
  priority: 'CRITICAL' as HostCopyPriority,
  actionLabel: 'Contact Support',
};

/** H-008 — Posting expiring in 48 hours */
export function buildH008PostingExpiring(params: {
  dateStr: string;
  jobTitle: string;
}) {
  const when = params.dateStr || 'your shift';
  const emailSubject = params.dateStr
    ? `Reminder: Shift Coverage Needed for ${params.dateStr}`
    : 'Reminder: Shift Coverage Needed';
  return {
    inAppTitle: emailSubject,
    inAppBody: `Your opportunity for ${when} expires in 48 hours with no confirmed locum. Consider extending or reposting.`,
    emailSubject,
    emailBody: `Your locum opportunity scheduled for ${when} expires in 48 hours and has not been filled. You may want to adjust compensation, extend the deadline, or browse available locums.`,
    priority: 'CRITICAL' as HostCopyPriority,
    actionLabel: 'Extend Opportunity',
  };
}

/** H-009 — Last-minute shift cancellation (<24h) */
export function buildH009ShiftCancelled(params: {
  dateStr: string;
  clinicName: string;
  cancelledBy: string;
  reason: string;
}) {
  const when = params.dateStr || 'your shift';
  return {
    inAppTitle: 'Last-Minute Cancellation Alert',
    inAppBody: `Last-minute cancellation: ${when} shift at ${params.clinicName} cancelled by ${params.cancelledBy}. Reason: ${params.reason}.`,
    emailSubject: 'Last-Minute Cancellation Alert',
    emailBody: `Shift on ${when} at ${params.clinicName} has been cancelled by ${params.cancelledBy} with less than 24 hours notice. Reason: ${params.reason}.`,
    priority: 'CRITICAL' as HostCopyPriority,
    actionLabel: 'Repost Opportunity',
  };
}

export function formatHostRejectionReason(reason?: string | null): string {
  const trimmed = reason?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : 'Additional documentation is required';
}

export function isShiftWithin24Hours(startDate: Date | string | null | undefined): boolean {
  if (!startDate) return false;
  const diffMs = new Date(startDate).getTime() - Date.now();
  return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
}

export { formatJobDate };
