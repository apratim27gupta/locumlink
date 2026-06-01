export type LocumCopyPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export function formatLocumDoctorName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name ? `Dr. ${name}` : 'Doctor';
}

export function formatJobDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function formatPayPerDay(pay: number | null | undefined): string {
  if (pay == null) return '';
  return ` Rate: $${Number(pay).toLocaleString()}/day.`;
}

export function formatVerificationRejectionReason(reason?: string | null): string {
  const trimmed = reason?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : 'Additional documentation is required';
}

export function formatSuspensionReason(note?: string | null): string {
  const trimmed = note?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'an administrative review';
}

export function contactSupportMailtoHref(): string {
  const email =
    process.env.SUPPORT_EMAIL?.trim() || 'support@locumlink.ca';
  const subject = encodeURIComponent('Account suspension — support request');
  return `mailto:${email}?subject=${subject}`;
}

export function locumBrowseHref(jobId?: string): string {
  return jobId ? `/locum/browse?job=${encodeURIComponent(jobId)}` : '/locum/browse';
}

export function locumMessagesHref(partnerId: string): string {
  return `/locum/messages?partnerId=${encodeURIComponent(partnerId)}`;
}

/** L-001 — New opportunity posted */
export function buildL001NewOpportunity(params: {
  doctorName: string;
  jobTitle: string;
  dateStr: string;
  payStr: string;
  locationStr: string;
}) {
  const when = params.dateStr ? ` on ${params.dateStr}` : '';
  const where = params.locationStr ? ` in ${params.locationStr}` : '';
  return {
    inAppTitle: 'New Locum Opportunity Available',
    inAppBody: `${params.jobTitle}${when} is now available.${params.payStr ? ` ${params.payStr.trim()}` : ''}`,
    emailSubject: `New Locum Opportunity: ${params.jobTitle}`,
    emailBody: `Hello ${params.doctorName}, A new locum opportunity has been posted on LocumLink L2: ${params.jobTitle}${when}${params.payStr}${where}. Log in to view details and apply.`,
    priority: 'NORMAL' as LocumCopyPriority,
    actionLabel: 'Browse Opportunities',
  };
}

/** L-002 — Host confirmed placement */
export function buildL002HostConfirmed(params: {
  doctorName: string;
  jobTitle: string;
  clinicName: string;
  dateStr: string;
}) {
  const when = params.dateStr ? ` on ${params.dateStr}` : '';
  return {
    inAppTitle: 'Placement Confirmed',
    inAppBody: `You have been confirmed for ${params.jobTitle} at ${params.clinicName}${when}. Please accept or decline your placement.`,
    emailSubject: `Confirmed: ${params.jobTitle}`,
    emailBody: `Hello ${params.doctorName}, You have been confirmed for ${params.jobTitle} at ${params.clinicName}${when}. Log in to LocumLink L2 to accept or decline this placement.`,
    priority: 'HIGH' as LocumCopyPriority,
    actionLabel: 'View Placement',
  };
}

/** L-003 — Application accepted (shortlisted) */
export function buildL003ApplicationAccepted(params: {
  doctorName: string;
  jobTitle: string;
  dateStr: string;
}) {
  const when = params.dateStr ? ` for ${params.dateStr}` : '';
  return {
    inAppTitle: 'Application Accepted — Action Required',
    inAppBody: `Your application for ${params.jobTitle}${when} was accepted. Please confirm your availability.`,
    emailSubject: 'Application Accepted — Confirm Your Availability',
    emailBody: `Hello ${params.doctorName}, Your application for ${params.jobTitle}${when} has been accepted by the host. Please log in to LocumLink L2 to confirm your availability.`,
    priority: 'HIGH' as LocumCopyPriority,
    actionLabel: 'Confirm Availability',
  };
}

/** L-004 — Application declined */
export function buildL004ApplicationDeclined(params: {
  doctorName: string;
  jobTitle: string;
}) {
  return {
    inAppTitle: 'Application Update',
    inAppBody: `Your application for ${params.jobTitle} was not selected. Browse other opportunities.`,
    emailSubject: 'Application Update — LocumLink L2',
    emailBody: `Hello ${params.doctorName}, Thank you for your interest. Your application for ${params.jobTitle} was not selected at this time. Log in to LocumLink L2 to browse other opportunities across Nova Scotia.`,
    priority: 'NORMAL' as LocumCopyPriority,
    actionLabel: 'Browse Opportunities',
  };
}

/** L-005 — Shift reminder 48 hours */
export function buildL005ShiftReminder48h(params: {
  doctorName: string;
  clinicName: string;
  dateStr: string;
  timeStr: string;
}) {
  const at = params.timeStr ? ` at ${params.timeStr}` : '';
  return {
    inAppTitle: 'Upcoming Shift Reminder',
    inAppBody: `Your shift at ${params.clinicName} starts in 48 hours on ${params.dateStr}${at}.`,
    emailSubject: `Shift Reminder: ${params.dateStr} at ${params.clinicName}`,
    emailBody: `Hello ${params.doctorName}, This is a reminder that your confirmed shift at ${params.clinicName} starts in 48 hours on ${params.dateStr}${at}.`,
    priority: 'NORMAL' as LocumCopyPriority,
    actionLabel: 'View Schedule',
  };
}

/** L-006 — Evening before shift */
export function buildL006ShiftReminderEvening(params: {
  doctorName: string;
  clinicName: string;
  timeStr: string;
}) {
  const at = params.timeStr ? ` at ${params.timeStr}` : '';
  return {
    inAppTitle: "Tomorrow's Shift Reminder",
    inAppBody: `Your shift at ${params.clinicName} begins tomorrow${at}. Ensure you have all credentials ready.`,
    emailSubject: `Tomorrow: Shift at ${params.clinicName}`,
    emailBody: `Hello ${params.doctorName}, Your shift at ${params.clinicName} begins tomorrow${at}. Please ensure you have all credentials and travel arrangements ready.`,
    priority: 'NORMAL' as LocumCopyPriority,
    actionLabel: 'View Shift Details',
  };
}

/** L-007 — Shift reminder 2 hours */
export function buildL007ShiftReminder2h(params: {
  doctorName: string;
  clinicName: string;
  timeStr: string;
}) {
  const at = params.timeStr || 'the scheduled time';
  return {
    inAppTitle: 'Shift Starting Soon',
    inAppBody: `Your shift at ${params.clinicName} starts in 2 hours. Safe travels!`,
    emailSubject: `Your shift starts in 2 hours — ${params.clinicName}`,
    emailBody: `Hello ${params.doctorName}, Safe travels! Your shift at ${params.clinicName} starts at ${at}.`,
    priority: 'HIGH' as LocumCopyPriority,
    actionLabel: 'View Shift',
  };
}

/** L-008 — New message */
export function buildL008NewMessage(params: {
  senderName: string;
  preview: string;
}) {
  return {
    inAppTitle: 'New Message',
    inAppBody: `${params.senderName} sent you a message: ${params.preview}`,
    emailSubject: `New message from ${params.senderName}`,
    emailBody: `${params.senderName} sent you a message on LocumLink L2:\n\n${params.preview}\n\nLog in to reply.`,
    priority: 'NORMAL' as LocumCopyPriority,
    actionLabel: 'Reply',
  };
}

/** L-009 — Locum account verified */
export const L009_LOCUM_ACCOUNT_VERIFIED = {
  inAppTitle: 'Account Verified - Start Finding Shifts!',
  inAppBody:
    'Welcome to LocumLink L2! Your account is verified. Start browsing opportunities.',
  emailSubject: 'Account Verified - Start Finding Shifts!',
  emailBody: (doctorName: string) =>
    `Congratulations ${doctorName}! Your credentials have been verified. You can now apply for locum opportunities across Nova Scotia.`,
  priority: 'HIGH' as LocumCopyPriority,
  actionLabel: 'Browse Opportunities',
  browseHref: '/locum/browse',
};

/** L-010 — Locum account verification rejected */
export const L010_LOCUM_VERIFICATION_REJECTED = {
  inAppTitle: 'Action Required: Account Verification',
  inAppBody:
    'Account verification incomplete. Additional documentation required.',
  emailSubject: 'Action Required: Account Verification',
  emailBody: (doctorName: string, reason: string) =>
    `Hello ${doctorName}, We need additional information to verify your account. Reason: ${reason}. Please upload the required documents.`,
  priority: 'HIGH' as LocumCopyPriority,
  actionLabel: 'Complete Verification',
  profileHref: '/locum/profile',
};

/** L-011 — Locum account suspended */
export const L011_LOCUM_ACCOUNT_SUSPENDED = {
  inAppTitle: 'Account suspended',
  inAppBody: 'Your account has been suspended. Contact support immediately.',
  emailSubject: 'Important: Account Suspension Notice',
  emailBody: (reason: string) =>
    `Your LocumLink L2 account has been suspended due to ${reason}. Please contact support to resolve this issue.`,
  priority: 'CRITICAL' as LocumCopyPriority,
  actionLabel: 'Contact Support',
};

/** L-012 — Host cancelled confirmed shift */
export function buildL012ShiftCancelled(params: {
  doctorName: string;
  clinicName: string;
  dateStr: string;
  jobTitle: string;
}) {
  const when = params.dateStr ? ` on ${params.dateStr}` : '';
  return {
    inAppTitle: 'Shift Cancelled',
    inAppBody: `Your confirmed shift${when} at ${params.clinicName} (${params.jobTitle}) has been cancelled by the host.`,
    emailSubject: 'Shift Cancellation Notice',
    emailBody: `Hello ${params.doctorName}, Your confirmed shift${when} at ${params.clinicName} for ${params.jobTitle} has been cancelled by the host. Log in to LocumLink L2 to browse other opportunities.`,
    priority: 'HIGH' as LocumCopyPriority,
    actionLabel: 'Browse Opportunities',
  };
}
