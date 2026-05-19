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
