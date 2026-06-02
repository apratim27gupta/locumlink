export type AdminCopyPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL';

/** A-001 — New host registration */
export function buildA001HostRegistration(params: {
  doctorName: string;
  clinicLocation: string;
}) {
  return {
    inAppTitle: 'New Host Registration - Action Required',
    inAppBody: `New host physician registration: ${params.doctorName} - ${params.clinicLocation}. Credentials pending review.`,
    emailSubject: 'New Host Registration - Action Required',
    emailBody: `New host physician ${params.doctorName} from ${params.clinicLocation} has registered. Credentials require verification.`,
    priority: 'HIGH' as AdminCopyPriority,
    actionLabel: 'Review Registration',
    href: '/admin/verifications',
  };
}

/** A-002 — New locum registration */
export function buildA002LocumRegistration(params: {
  doctorName: string;
  specialty: string;
}) {
  return {
    inAppTitle: 'New Locum Registration - Action Required',
    inAppBody: `New locum physician registration: ${params.doctorName} - ${params.specialty}. Credentials pending review.`,
    emailSubject: 'New Locum Registration - Action Required',
    emailBody: `New locum physician ${params.doctorName} (${params.specialty}) has registered. Credentials require verification.`,
    priority: 'HIGH' as AdminCopyPriority,
    actionLabel: 'Review Registration',
    href: '/admin/verifications',
  };
}

/** A-003 — Credential uploaded */
export function buildA003CredentialUploaded(params: {
  doctorName: string;
  credentialType: string;
}) {
  return {
    inAppTitle: 'Credential Uploaded',
    inAppBody: `${params.doctorName} has uploaded ${params.credentialType} for verification.`,
    priority: 'HIGH' as AdminCopyPriority,
    actionLabel: 'Review Credential',
    href: '/admin/verifications',
  };
}

/** A-004 — Account flagged */
export function buildA004AccountFlagged(params: {
  doctorName: string;
  reason: string;
  reporter: string;
}) {
  return {
    inAppTitle: 'URGENT: Account Flagged for Review',
    inAppBody: `User account flagged: ${params.doctorName}. Reason: ${params.reason}. Reported by: ${params.reporter}.`,
    emailSubject: 'URGENT: Account Flagged for Review',
    emailBody: `User account ${params.doctorName} has been flagged. Reason: ${params.reason}. Reported by: ${params.reporter}. Immediate investigation required.`,
    priority: 'CRITICAL' as AdminCopyPriority,
    actionLabel: 'Investigate Report',
    href: '/admin/users',
  };
}

export function formatAdminDoctorName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (name) return `Dr. ${name}`;
  return fallback ?? 'Physician';
}

export function formatClinicLocation(
  clinic?: string | null,
  city?: string | null,
  province?: string | null,
): string {
  const parts = [clinic, [city, province].filter(Boolean).join(', ')].filter(
    Boolean,
  );
  return parts.join(', ') || 'Location pending';
}
