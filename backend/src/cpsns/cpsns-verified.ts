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

export function verificationStatusAfterCpsnsSave(
    existing: { cpsnsId: string; verificationStatus: VerificationStatus } | null,
    cpsnsDigits: string,
): Pick<{ verificationStatus: VerificationStatus; verifiedAt: Date | null }, 'verificationStatus' | 'verifiedAt'> | Record<string, never> {
    if (cpsnsDigits.length !== 9)
        return {};
    if (!existing)
        return { verificationStatus: VerificationStatus.PENDING_REVIEW };
    const prevDigits = normalizeCpsns(existing.cpsnsId);
    const cpsnsChanged = prevDigits !== cpsnsDigits;
    if (existing.verificationStatus === VerificationStatus.VERIFIED && cpsnsChanged) {
        return {
            verificationStatus: VerificationStatus.PENDING_REVIEW,
            verifiedAt: null,
        };
    }
    if (
        existing.verificationStatus === VerificationStatus.UNVERIFIED
        || existing.verificationStatus === VerificationStatus.REJECTED
    ) {
        return { verificationStatus: VerificationStatus.PENDING_REVIEW };
    }
    return {};
}

/** Host profiles store CPSNS verification on `cpsnsVerificationStatus`, not `verificationStatus`. */
export function hostCpsnsVerificationPatch(
    existing: { cpsnsId: string; verificationStatus: VerificationStatus } | null,
    cpsnsDigits: string,
): Pick<
    { cpsnsVerificationStatus: VerificationStatus; cpsnsVerifiedAt: Date | null },
    'cpsnsVerificationStatus' | 'cpsnsVerifiedAt'
> | Record<string, never> {
    const patch = verificationStatusAfterCpsnsSave(existing, cpsnsDigits);
    if (!('verificationStatus' in patch)) return {};
    return {
        cpsnsVerificationStatus: patch.verificationStatus,
        ...('verifiedAt' in patch ? { cpsnsVerifiedAt: patch.verifiedAt } : {}),
    };
}
