import {
  isEligibleForCredentialQueueHost,
  isEligibleForCredentialQueueLocum,
  type CpsnsVerificationStatus,
} from '@/lib/cpsnsVerify';

export type AdminUserAccountStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'SUSPENDED'
  | 'DEACTIVATED';

export type AdminUserDisplayStatusKey =
  | 'verified'
  | 'rejected'
  | 'under_review'
  | 'pending'
  | 'suspended'
  | 'deactivated'
  | 'incomplete_profile'
  | 'no_profile'
  | 'not_submitted';

/** Account-axis filter (multi-select, OR within). */
export const ADMIN_USER_ACCOUNT_FILTER_OPTIONS = [
  { value: 'active' as const, label: 'Active' },
  { value: 'pending' as const, label: 'Setup incomplete' },
  { value: 'suspended' as const, label: 'Suspended' },
  { value: 'deactivated' as const, label: 'Deactivated' },
] as const;

/** Credential-axis filter (multi-select, OR within). */
export const ADMIN_USER_CREDENTIAL_FILTER_OPTIONS = [
  { value: 'verified' as const, label: 'Verified' },
  { value: 'rejected' as const, label: 'Rejected' },
  { value: 'under_review' as const, label: 'Under review' },
  { value: 'incomplete_profile' as const, label: 'Incomplete profile' },
  { value: 'not_submitted' as const, label: 'Not submitted' },
  { value: 'no_profile' as const, label: 'No profile' },
] as const;

export type AdminUserAccountFilterValue =
  (typeof ADMIN_USER_ACCOUNT_FILTER_OPTIONS)[number]['value'];

export type AdminUserCredentialFilterValue =
  (typeof ADMIN_USER_CREDENTIAL_FILTER_OPTIONS)[number]['value'];

export type AdminUserDisplayStatus = {
  key: AdminUserDisplayStatusKey;
  label: string;
  className: string;
};

type RowLike = {
  role: 'LOCUM' | 'HOST' | 'ADMIN';
  status: AdminUserAccountStatus;
  cpsnsVerificationStatus: CpsnsVerificationStatus | null;
  inCredentialQueue?: boolean;
};

/** Account bucket for filtering (independent of credentials). */
export function adminUserAccountFilterKey(
  row: Pick<RowLike, 'status'>,
): AdminUserAccountFilterValue {
  if (row.status === 'SUSPENDED') return 'suspended';
  if (row.status === 'DEACTIVATED') return 'deactivated';
  if (row.status === 'PENDING') return 'pending';
  return 'active';
}

/** Credential bucket for filtering (independent of account suspension). */
export function adminUserCredentialFilterKey(
  row: Pick<RowLike, 'cpsnsVerificationStatus' | 'inCredentialQueue'>,
): AdminUserCredentialFilterValue {
  if (row.cpsnsVerificationStatus === 'VERIFIED') return 'verified';
  if (row.cpsnsVerificationStatus === 'REJECTED') return 'rejected';
  if (row.inCredentialQueue) return 'under_review';
  if (row.cpsnsVerificationStatus === 'PENDING_REVIEW') {
    return 'incomplete_profile';
  }
  if (!row.cpsnsVerificationStatus) return 'no_profile';
  return 'not_submitted';
}

/**
 * Single triage badge for the table (account takes priority over credentials).
 * Filters use the split helpers above instead.
 */
export function adminUserDisplayStatus(row: RowLike): AdminUserDisplayStatus {
  if (row.status === 'SUSPENDED') {
    return { key: 'suspended', label: 'Suspended', className: 'status-suspended' };
  }
  if (row.status === 'DEACTIVATED') {
    return {
      key: 'deactivated',
      label: 'Deactivated',
      className: 'status-deactivated',
    };
  }
  if (row.cpsnsVerificationStatus === 'VERIFIED') {
    return { key: 'verified', label: 'Verified', className: 'status-verified' };
  }
  if (row.cpsnsVerificationStatus === 'REJECTED') {
    return { key: 'rejected', label: 'Rejected', className: 'status-rejected' };
  }
  if (row.inCredentialQueue) {
    return {
      key: 'under_review',
      label: 'Under review',
      className: 'status-under-review',
    };
  }
  if (row.status === 'PENDING') {
    return {
      key: 'pending',
      label: 'Setup incomplete',
      className: 'status-pending',
    };
  }
  if (row.cpsnsVerificationStatus === 'PENDING_REVIEW') {
    return {
      key: 'incomplete_profile',
      label: 'Incomplete profile',
      className: 'text-muted',
    };
  }
  if (!row.cpsnsVerificationStatus) {
    return { key: 'no_profile', label: 'No profile', className: 'text-muted' };
  }
  return {
    key: 'not_submitted',
    label: 'Not submitted',
    className: 'text-muted',
  };
}

export function emptyAdminUserAccountCounts(): Record<
  AdminUserAccountFilterValue,
  number
> {
  return {
    active: 0,
    pending: 0,
    suspended: 0,
    deactivated: 0,
  };
}

export function emptyAdminUserCredentialCounts(): Record<
  AdminUserCredentialFilterValue,
  number
> {
  return {
    verified: 0,
    rejected: 0,
    under_review: 0,
    incomplete_profile: 0,
    not_submitted: 0,
    no_profile: 0,
  };
}

export function parseAdminUserAccountFilters(
  raw: string | null | undefined,
): AdminUserAccountFilterValue[] {
  if (!raw?.trim()) return [];
  const allowed = new Set(
    ADMIN_USER_ACCOUNT_FILTER_OPTIONS.map((o) => o.value),
  );
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AdminUserAccountFilterValue =>
      allowed.has(s as AdminUserAccountFilterValue),
    );
}

export function parseAdminUserCredentialFilters(
  raw: string | null | undefined,
): AdminUserCredentialFilterValue[] {
  if (!raw?.trim()) return [];
  const allowed = new Set(
    ADMIN_USER_CREDENTIAL_FILTER_OPTIONS.map((o) => o.value),
  );
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AdminUserCredentialFilterValue =>
      allowed.has(s as AdminUserCredentialFilterValue),
    );
}

export function computeInCredentialQueue(params: {
  role: 'LOCUM' | 'HOST' | 'ADMIN';
  locumProfile: {
    cpsnsVerificationStatus: CpsnsVerificationStatus | null | undefined;
    cpsnsId: string | null | undefined;
    licenseFileName?: string | null;
    resumeFileName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  hostProfile: {
    cpsnsVerificationStatus: CpsnsVerificationStatus | null | undefined;
    cpsnsNumber: string | null | undefined;
    practiceName?: string | null;
    licenseFile?: string | null;
    photoIdFile?: string | null;
  } | null;
}): boolean {
  if (params.role === 'LOCUM' && params.locumProfile) {
    return isEligibleForCredentialQueueLocum(params.locumProfile);
  }
  if (params.role === 'HOST' && params.hostProfile) {
    return isEligibleForCredentialQueueHost(params.hostProfile);
  }
  return false;
}
