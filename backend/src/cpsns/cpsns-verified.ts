import { VerificationStatus } from '@prisma/client';

export function normalizeCpsns(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D/g, '');
}

export function hasCpsnsNumber(input: string | null | undefined): boolean {
  const raw = String(input ?? '').trim();
  if (!raw || /^pending-/i.test(raw)) return false;
  return normalizeCpsns(input).length > 0;
}

/** @deprecated Use hasCpsnsNumber */
export function isCpsnsNineDigitsFormat(
  input: string | null | undefined,
): boolean {
  return hasCpsnsNumber(input);
}

/** True only after an admin approves CPSNS in the verifications queue. */
export function isCpsnsVerificationApproved(
  status: VerificationStatus | string | null | undefined,
): boolean {
  return status === VerificationStatus.VERIFIED || status === 'VERIFIED';
}

type CpsnsProfileVerification = {
  cpsnsNumber: string | null;
  cpsnsVerificationStatus: VerificationStatus;
};

export function cpsnsVerificationPatch(
  existing: CpsnsProfileVerification | null,
  cpsnsDigits: string,
):
  | Pick<
      {
        cpsnsVerificationStatus: VerificationStatus;
        cpsnsVerifiedAt: Date | null;
      },
      'cpsnsVerificationStatus' | 'cpsnsVerifiedAt'
    >
  | Record<string, never> {
  if (!cpsnsDigits) return {};
  if (!existing) {
    return { cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW };
  }
  const prevDigits = normalizeCpsns(existing.cpsnsNumber);
  const cpsnsChanged = prevDigits !== cpsnsDigits;
  if (
    existing.cpsnsVerificationStatus === VerificationStatus.VERIFIED &&
    cpsnsChanged
  ) {
    return {
      cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW,
      cpsnsVerifiedAt: null,
    };
  }
  if (
    existing.cpsnsVerificationStatus === VerificationStatus.UNVERIFIED ||
    existing.cpsnsVerificationStatus === VerificationStatus.REJECTED
  ) {
    return { cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW };
  }
  return {};
}

/** Queue profile for admin credential review when setup/docs are saved (even without CPSNS yet). */
export function credentialReviewPatchOnProfileSave(
  existing: CpsnsProfileVerification | null,
  cpsnsDigits: string,
  profileSubmittedForReview: boolean,
):
  | Pick<
      {
        cpsnsVerificationStatus: VerificationStatus;
        cpsnsVerifiedAt: Date | null;
      },
      'cpsnsVerificationStatus' | 'cpsnsVerifiedAt'
    >
  | Record<string, never> {
  const cpsnsPatch = cpsnsVerificationPatch(existing, cpsnsDigits);
  if (Object.keys(cpsnsPatch).length > 0) {
    return cpsnsPatch;
  }
  if (!profileSubmittedForReview) {
    return {};
  }
  if (!existing) {
    return { cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW };
  }
  if (
    existing.cpsnsVerificationStatus === VerificationStatus.UNVERIFIED ||
    existing.cpsnsVerificationStatus === VerificationStatus.REJECTED
  ) {
    return { cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW };
  }
  return {};
}

/** Profiles that may appear in the admin credential queue (by status only). */
export function isInCredentialQueue(
  status: VerificationStatus | null | undefined,
): boolean {
  return (
    status === VerificationStatus.UNVERIFIED ||
    status === VerificationStatus.PENDING_REVIEW ||
    status === VerificationStatus.REJECTED
  );
}

export function isEligibleForCredentialQueueLocum(profile: {
  cpsnsVerificationStatus: VerificationStatus | null | undefined;
  cpsnsId: string | null | undefined;
  licenseFileName?: string | null;
  resumeFileName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  if (!isInCredentialQueue(profile.cpsnsVerificationStatus)) return false;
  const hasCpsns = hasCpsnsNumber(profile.cpsnsId);
  const hasProfile = Boolean(
    profile.licenseFileName?.trim() ||
    profile.resumeFileName?.trim() ||
    profile.firstName?.trim() ||
    profile.lastName?.trim(),
  );
  return hasCpsns || hasProfile;
}

/** After signup (account still PENDING), push completed profiles into the review queue. */
export function mergeCredentialReviewPatchForAccountPending(
  existing: CpsnsProfileVerification | null,
  basePatch:
    | Pick<
        {
          cpsnsVerificationStatus: VerificationStatus;
          cpsnsVerifiedAt: Date | null;
        },
        'cpsnsVerificationStatus' | 'cpsnsVerifiedAt'
      >
    | Record<string, never>,
  profileSubmittedForReview: boolean,
  accountStatusPending: boolean,
):
  | Pick<
      {
        cpsnsVerificationStatus: VerificationStatus;
        cpsnsVerifiedAt: Date | null;
      },
      'cpsnsVerificationStatus' | 'cpsnsVerifiedAt'
    >
  | Record<string, never> {
  if (Object.keys(basePatch).length > 0) return basePatch;
  if (!accountStatusPending || !profileSubmittedForReview) return basePatch;
  if (existing?.cpsnsVerificationStatus === VerificationStatus.VERIFIED) {
    return basePatch;
  }
  return {
    cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW,
    cpsnsVerifiedAt: null,
  };
}

export function isEligibleForCredentialQueueHost(profile: {
  cpsnsVerificationStatus: VerificationStatus | null | undefined;
  cpsnsNumber: string | null | undefined;
  practiceName?: string | null;
  licenseFile?: string | null;
  photoIdFile?: string | null;
}): boolean {
  if (!isInCredentialQueue(profile.cpsnsVerificationStatus)) return false;
  const hasCpsns = hasCpsnsNumber(profile.cpsnsNumber);
  const hasClinicProfile = Boolean(profile.practiceName?.trim());
  const hasDocs = Boolean(
    profile.licenseFile?.trim() || profile.photoIdFile?.trim(),
  );
  return hasCpsns || hasClinicProfile || hasDocs;
}
