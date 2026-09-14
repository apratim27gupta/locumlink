import { Role, VerificationStatus } from '@prisma/client';
import {
  isEligibleForCredentialQueueHost,
  isEligibleForCredentialQueueLocum,
} from '../cpsns/cpsns-verified.js';

export type AdminUserAccountFilter =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'deactivated';

export type AdminUserCredentialFilter =
  | 'verified'
  | 'rejected'
  | 'under_review'
  | 'incomplete_profile'
  | 'not_submitted'
  | 'no_profile';

const ACCOUNT_FILTERS = new Set<AdminUserAccountFilter>([
  'active',
  'pending',
  'suspended',
  'deactivated',
]);

const CREDENTIAL_FILTERS = new Set<AdminUserCredentialFilter>([
  'verified',
  'rejected',
  'under_review',
  'incomplete_profile',
  'not_submitted',
  'no_profile',
]);

export function emptyAdminUserAccountCounts(): Record<
  AdminUserAccountFilter,
  number
> {
  return { active: 0, pending: 0, suspended: 0, deactivated: 0 };
}

export function emptyAdminUserCredentialCounts(): Record<
  AdminUserCredentialFilter,
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
  raw: string | undefined,
): AdminUserAccountFilter[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AdminUserAccountFilter =>
      ACCOUNT_FILTERS.has(s as AdminUserAccountFilter),
    );
}

export function parseAdminUserCredentialFilters(
  raw: string | undefined,
): AdminUserCredentialFilter[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AdminUserCredentialFilter =>
      CREDENTIAL_FILTERS.has(s as AdminUserCredentialFilter),
    );
}

export function adminUserAccountFilterKey(status: string): AdminUserAccountFilter {
  if (status === 'SUSPENDED') return 'suspended';
  if (status === 'DEACTIVATED') return 'deactivated';
  if (status === 'PENDING') return 'pending';
  return 'active';
}

export function adminUserCredentialFilterKey(row: {
  cpsnsVerificationStatus: VerificationStatus | null;
  inCredentialQueue: boolean;
}): AdminUserCredentialFilter {
  if (row.cpsnsVerificationStatus === VerificationStatus.VERIFIED) {
    return 'verified';
  }
  if (row.cpsnsVerificationStatus === VerificationStatus.REJECTED) {
    return 'rejected';
  }
  if (row.inCredentialQueue) return 'under_review';
  if (row.cpsnsVerificationStatus === VerificationStatus.PENDING_REVIEW) {
    return 'incomplete_profile';
  }
  if (!row.cpsnsVerificationStatus) return 'no_profile';
  return 'not_submitted';
}

export function computeInCredentialQueue(user: {
  role: Role;
  locumProfile: {
    cpsnsVerificationStatus: VerificationStatus | null;
    cpsnsId: string | null;
    licenseFileName: string | null;
    resumeFileName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  hostProfile: {
    cpsnsVerificationStatus: VerificationStatus | null;
    cpsnsNumber: string | null;
    practiceName: string | null;
    licenseFile: string | null;
    photoIdFile: string | null;
  } | null;
}): boolean {
  if (user.role === Role.LOCUM && user.locumProfile) {
    return isEligibleForCredentialQueueLocum(user.locumProfile);
  }
  if (user.role === Role.HOST && user.hostProfile) {
    return isEligibleForCredentialQueueHost(user.hostProfile);
  }
  return false;
}
