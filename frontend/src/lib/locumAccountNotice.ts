import type { LocumProfile } from '@/types';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';

export type LocumDashboardStatusBadge = {
    label: string;
    background: string;
    color: string;
    border: string;
};

/** Locum dashboard profile banner: account + CPSNS status pill. */
export function getLocumDashboardStatusBadge(
    profile: LocumProfile | null | undefined,
): LocumDashboardStatusBadge | null {
    if (!profile) return null;
    if (profile.accountStatus === 'SUSPENDED') {
        return {
            label: 'Suspended',
            background: '#fee2e2',
            color: '#991b1b',
            border: '#fca5a5',
        };
    }
    if (profile.accountStatus === 'DEACTIVATED') {
        return {
            label: 'Deactivated',
            background: '#f1f5f9',
            color: '#475569',
            border: '#cbd5e1',
        };
    }
    if (isCpsnsVerificationApproved(profile.cpsnsVerificationStatus)) {
        return {
            label: 'Verified',
            background: '#dbeafe',
            color: '#1e40af',
            border: '#93c5fd',
        };
    }
    if (
        profile.cpsnsVerificationStatus === 'PENDING_REVIEW'
        || profile.cpsnsVerificationStatus === 'UNVERIFIED'
    ) {
        return {
            label: 'Under verification',
            background: 'rgba(59, 79, 216, 0.12)',
            color: '#1B31D2',
            border: 'rgba(59, 79, 216, 0.25)',
        };
    }
    if (profile.cpsnsVerificationStatus === 'REJECTED') {
        return {
            label: 'Not verified',
            background: '#ffedd5',
            color: '#9a3412',
            border: '#fdba74',
        };
    }
    return null;
}

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
