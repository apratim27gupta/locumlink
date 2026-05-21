import type { LocumProfile } from '@/types';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';

export type LocumAccountNotice = {
    title: string;
    message: string;
    variant: 'rejected' | 'suspended';
};

export function getLocumAccountNotice(
    profile: LocumProfile | null | undefined,
): LocumAccountNotice | null {
    if (!profile) return null;
    if (profile.accountStatus === 'SUSPENDED') {
        const note = profile.suspensionNote?.trim();
        return {
            variant: 'suspended',
            title: 'Account suspended',
            message:
                note ||
                'Your account has been suspended. Contact support for assistance.',
        };
    }
    if (profile.cpsnsVerificationStatus === 'REJECTED') {
        const reason = profile.rejectionReason?.trim();
        return {
            variant: 'rejected',
            title: 'Credential verification rejected',
            message:
                reason ||
                'Your CPSNS verification was rejected. Update your profile and resubmit for review.',
        };
    }
    return null;
}

export function locumCanApplyToJobs(
    profile: LocumProfile | null | undefined,
): boolean {
    if (!profile) return false;
    if (profile.accountStatus === 'SUSPENDED' || profile.accountStatus === 'DEACTIVATED') {
        return false;
    }
    return isCpsnsVerificationApproved(profile.cpsnsVerificationStatus);
}

export function getLocumApplyBlockedMessage(
    profile: LocumProfile | null | undefined,
): string {
    const notice = getLocumAccountNotice(profile);
    if (notice) return notice.message;
    return 'Your CPSNS must be verified by an administrator before you can apply. Complete your profile and upload your license, then wait for approval.';
}
