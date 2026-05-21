export type CpsnsVerificationStatus =
    | 'UNVERIFIED'
    | 'PENDING_REVIEW'
    | 'VERIFIED'
    | 'REJECTED';

export function normalizeCpsns(input: string | null | undefined): string {
    return String(input ?? '').replace(/\D/g, '');
}

export function isCpsnsNineDigitsFormat(input: string | null | undefined): boolean {
    return normalizeCpsns(input).length === 9;
}

export function sanitizeCpsnsInput(raw: string): string {
    return normalizeCpsns(raw).slice(0, 9);
}

/** True only after an admin approves CPSNS in the verifications queue. */
export function isCpsnsVerificationApproved(
    status: CpsnsVerificationStatus | null | undefined,
): boolean {
    return status === 'VERIFIED';
}

/** CPSNS save patch for locum and host profiles. */
export function cpsnsVerificationData(
    existing: { cpsnsNumber: string | null; cpsnsVerificationStatus: CpsnsVerificationStatus } | null,
    cpsnsDigits: string,
): { cpsnsVerificationStatus: CpsnsVerificationStatus; cpsnsVerifiedAt: Date | null } | null {
    if (cpsnsDigits.length !== 9) return null;
    if (!existing) {
        return { cpsnsVerificationStatus: 'PENDING_REVIEW', cpsnsVerifiedAt: null };
    }
    const prevDigits = normalizeCpsns(existing.cpsnsNumber);
    const cpsnsChanged = prevDigits !== cpsnsDigits;
    if (existing.cpsnsVerificationStatus === 'VERIFIED' && cpsnsChanged) {
        return { cpsnsVerificationStatus: 'PENDING_REVIEW', cpsnsVerifiedAt: null };
    }
    if (
        existing.cpsnsVerificationStatus === 'UNVERIFIED'
        || existing.cpsnsVerificationStatus === 'REJECTED'
    ) {
        return { cpsnsVerificationStatus: 'PENDING_REVIEW', cpsnsVerifiedAt: null };
    }
    return null;
}

/** @deprecated Use cpsnsVerificationData */
export const hostCpsnsVerificationData = cpsnsVerificationData;

export function isHostVerificationPending(
    status: CpsnsVerificationStatus | null | undefined,
): boolean {
    return status === 'UNVERIFIED' || status === 'PENDING_REVIEW';
}
