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

/** Full month + compact year for host new-applicant notification titles */
export function formatJobDateHostApplicantTitle(
  date: Date | string | null | undefined,
): string {
  if (!date) return '';
  const formatted = new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
  return formatted.replace(/, (\d{4})$/, ',$1');
}

export function formatPayPerDay(pay: number | null | undefined): string {
  if (pay == null) return '';
  return ` Rate: $${Number(pay).toLocaleString()}/day.`;
}

export function formatVerificationRejectionReason(
  reason?: string | null,
): string {
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
  return '/support';
}

export function locumBrowseHref(jobId?: string): string {
  return jobId
    ? `/locum/browse?job=${encodeURIComponent(jobId)}`
    : '/locum/browse';
}

export function locumMessagesHref(partnerId: string): string {
  return `/locum/messages?partnerId=${encodeURIComponent(partnerId)}`;
}

/** L-001 — New opportunity posted */
export function buildL001NewOpportunity(params: {
  jobTitle: string;
  payPerDay?: number | null;
}) {
  const ratePart = formatPayPerDay(params.payPerDay);
  const inAppBody = `A new ${params.jobTitle} locum opportunity has been posted.${ratePart}`;
  return {
    inAppTitle: 'New Locum Opportunity Available',
    inAppBody,
    emailSubject: `New Locum Opportunity: ${params.jobTitle}`,
    emailBody: inAppBody,
    priority: 'NORMAL' as LocumCopyPriority,
    actionLabel: 'Browse Opportunities',
  };
}

export function formatClinicAddress(parts: {
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}): string {
  return [parts.address, parts.city, parts.province, parts.postalCode]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(', ');
}

/** L-002 — Host confirms/books locum for opportunity */
export function buildL002HostConfirmed(params: {
  jobTitle: string;
  clinicName: string;
}) {
  const inAppBody = `Congratulations! You've been confirmed for ${params.jobTitle} shift at ${params.clinicName}.`;
  return {
    inAppTitle: `Shift Confirmed: ${params.jobTitle} at ${params.clinicName}`,
    inAppBody,
    emailSubject: `Shift Confirmed: ${params.jobTitle} at ${params.clinicName}`,
    emailBody: inAppBody,
    priority: 'CRITICAL' as LocumCopyPriority,
    actionLabel: 'View Shift Details',
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
    emailBody: `Hello ${params.doctorName}, Your application for ${params.jobTitle}${when} has been accepted by the host. Please log in to Locum Link to confirm your availability.`,
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
    emailSubject: 'Application Update — Locum Link',
    emailBody: `Hello ${params.doctorName}, Thank you for your interest. Your application for ${params.jobTitle} was not selected at this time. Log in to Locum Link to browse other opportunities across Nova Scotia.`,
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
  const when = params.timeStr?.trim()
    ? `${params.dateStr} at ${params.timeStr.trim()}`
    : params.dateStr;
  const inAppBody = `Reminder: Your shift at ${params.clinicName} starts in 2 days (${when}).`;
  return {
    inAppTitle: 'Upcoming Shift Reminder',
    inAppBody,
    emailSubject: `Shift Reminder: ${params.dateStr} at ${params.clinicName}`,
    emailBody: inAppBody,
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
  const at = params.timeStr?.trim() || 'the scheduled time';
  const inAppBody = `Tomorrow morning: Your shift at ${params.clinicName} starts at ${at}. Be ready!`;
  return {
    inAppTitle: "Tomorrow's Shift Reminder",
    inAppBody,
    emailSubject: `Tomorrow: Shift at ${params.clinicName}`,
    emailBody: inAppBody,
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
  const inAppBody = `Your shift starts in 2 hours at ${params.clinicName}. Safe travels!`;
  return {
    inAppTitle: 'Shift Starting Soon',
    inAppBody,
    emailSubject: `Your shift starts in 2 hours — ${params.clinicName}`,
    emailBody: inAppBody,
    priority: 'HIGH' as LocumCopyPriority,
    actionLabel: 'View Shift',
  };
}

/** L-008 — New message */
export function buildL008NewMessage(params: {
  hostName: string;
  jobTitle: string;
  startDateStr: string;
}) {
  const shiftDate = params.startDateStr ? ` ${params.startDateStr}` : '';
  const inAppBody = `New message from Dr. ${params.hostName} about your ${params.jobTitle} shift${shiftDate}.`;
  return {
    inAppTitle: 'New Message',
    inAppBody,
    emailSubject: `New message from Dr. ${params.hostName}`,
    emailBody: inAppBody,
    priority: 'NORMAL' as LocumCopyPriority,
    actionLabel: 'Reply',
  };
}

/** L-009 — Locum account verified */
const L009_BODY =
  'Welcome to Locum Link! Your account is verified. Start browsing opportunities.';

export const L009_LOCUM_ACCOUNT_VERIFIED = {
  inAppTitle: 'Account Verified - Start Finding Shifts!',
  inAppBody: L009_BODY,
  emailSubject: 'Account Verified - Start Finding Shifts!',
  emailBody: L009_BODY,
  priority: 'HIGH' as LocumCopyPriority,
  actionLabel: 'Browse Opportunities',
  browseHref: '/locum/browse',
};

/** L-010 — Locum account verification rejected */
const L010_BODY =
  'Account verification incomplete. Additional documentation required.';

export const L010_LOCUM_VERIFICATION_REJECTED = {
  inAppTitle: 'Action Required: Account Verification',
  inAppBody: L010_BODY,
  emailSubject: 'Action Required: Account Verification',
  emailBody: L010_BODY,
  priority: 'HIGH' as LocumCopyPriority,
  actionLabel: 'Complete Verification',
  profileHref: '/locum/profile',
};

/** L-011 — Locum account suspended */
const L011_BODY =
  'Your account has been suspended. Contact support immediately.';

export const L011_LOCUM_ACCOUNT_SUSPENDED = {
  inAppTitle: 'Account suspended',
  inAppBody: L011_BODY,
  emailSubject: 'Important: Account Suspension Notice',
  emailBody: L011_BODY,
  priority: 'CRITICAL' as LocumCopyPriority,
  actionLabel: 'Contact Support',
};

/** L-013 — Locum account warning */
export function buildL013AccountWarning(params: { warningNote: string }) {
  const body = `A Locum Link admin has sent you an account warning: ${params.warningNote}`;
  return {
    inAppTitle: 'Account warning',
    inAppBody: body,
    emailSubject: 'Important: Locum Link account warning',
    emailBody: body,
    priority: 'HIGH' as LocumCopyPriority,
    actionLabel: 'Contact Support',
  };
}

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
    emailBody: `Hello ${params.doctorName}, Your confirmed shift${when} at ${params.clinicName} for ${params.jobTitle} has been cancelled by the host. Log in to Locum Link to browse other opportunities.`,
    priority: 'HIGH' as LocumCopyPriority,
    actionLabel: 'Browse Opportunities',
  };
}
