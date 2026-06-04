import type { LocumProfile } from '@/types';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import {
    getLocumVerificationStatusBadge,
    type ProfileVerificationBadge,
} from '@/lib/profileVerificationBadge';

export type LocumDashboardStatusBadge = ProfileVerificationBadge;

/** Locum dashboard profile banner: account + CPSNS status pill. */
export function getLocumDashboardStatusBadge(
    profile: LocumProfile | null | undefined,
): LocumDashboardStatusBadge | null {
    return getLocumVerificationStatusBadge(profile);
}

export type LocumAccountNotice = {
    title: string;
    message: string;
    variant: 'rejected' | 'suspended';
    /** Admin rejection reason (L-010), shown when present. */
    detail?: string;
};

export function getLocumAccountNotice(
    profile: LocumProfile | null | undefined,
): LocumAccountNotice | null {
    if (!profile) return null;
    if (profile.accountStatus === 'SUSPENDED') {
        return {
            variant: 'suspended',
            title: 'Account suspended',
            message: 'Your account has been suspended. Contact support immediately.',
        };
    }
    if (profile.cpsnsVerificationStatus === 'REJECTED') {
        const reason = profile.rejectionReason?.trim();
        return {
            variant: 'rejected',
            title: 'Action Required: Account Verification',
            message:
                'Account verification incomplete. Additional documentation required.',
            detail: reason || undefined,
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
