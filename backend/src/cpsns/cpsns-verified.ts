import { VerificationStatus } from '@prisma/client';

export function normalizeCpsns(input: string | null | undefined): string {
    return String(input ?? '').replace(/\D/g, '');
}

export function isCpsnsNineDigitsFormat(input: string | null | undefined): boolean {
    return normalizeCpsns(input).length === 9;
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
): Pick<
    { cpsnsVerificationStatus: VerificationStatus; cpsnsVerifiedAt: Date | null },
    'cpsnsVerificationStatus' | 'cpsnsVerifiedAt'
> | Record<string, never> {
    if (cpsnsDigits.length !== 9) return {};
    if (!existing) {
        return { cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW };
    }
    const prevDigits = normalizeCpsns(existing.cpsnsNumber);
    const cpsnsChanged = prevDigits !== cpsnsDigits;
    if (
        existing.cpsnsVerificationStatus === VerificationStatus.VERIFIED
        && cpsnsChanged
    ) {
        return {
            cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW,
            cpsnsVerifiedAt: null,
        };
    }
    if (
        existing.cpsnsVerificationStatus === VerificationStatus.UNVERIFIED
        || existing.cpsnsVerificationStatus === VerificationStatus.REJECTED
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
): Pick<
    { cpsnsVerificationStatus: VerificationStatus; cpsnsVerifiedAt: Date | null },
    'cpsnsVerificationStatus' | 'cpsnsVerifiedAt'
> | Record<string, never> {
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
        existing.cpsnsVerificationStatus === VerificationStatus.UNVERIFIED
        || existing.cpsnsVerificationStatus === VerificationStatus.REJECTED
    ) {
        return { cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW };
    }
    return {};
}
