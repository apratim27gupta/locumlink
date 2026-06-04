import type { HostProfile, LocumProfile } from '@/types';
import { isCpsnsVerificationApproved, isHostVerificationPending } from '@/lib/cpsnsVerify';

export type ProfileVerificationBadge = {
    label: string;
    background: string;
    color: string;
    border: string;
};

export const PROFILE_VERIFICATION_BADGE_UNDER_REVIEW: ProfileVerificationBadge = {
    label: 'Under verification',
    background: '#FEF2F2',
    color: '#DC2626',
    border: '#FECACA',
};

export const PROFILE_VERIFICATION_BADGE_VERIFIED: ProfileVerificationBadge = {
    label: 'CPSNS verified',
    background: '#DCFCE7',
    color: '#166534',
    border: '#86EFAC',
};

export const PROFILE_VERIFICATION_BADGE_NOT_VERIFIED: ProfileVerificationBadge = {
    label: 'Not verified',
    background: '#FFEDD5',
    color: '#9A3412',
    border: '#FDBA74',
};

function badgeFromAccountStatus(
    accountStatus: LocumProfile['accountStatus'] | HostProfile['accountStatus'],
): ProfileVerificationBadge | null {
    if (accountStatus === 'SUSPENDED') {
        return {
            label: 'Suspended',
            background: '#FEE2E2',
            color: '#991B1B',
            border: '#FCA5A5',
        };
    }
    if (accountStatus === 'DEACTIVATED') {
        return {
            label: 'Deactivated',
            background: '#F1F5F9',
            color: '#475569',
            border: '#CBD5E1',
        };
    }
    return null;
}

export function getLocumVerificationStatusBadge(
    profile: LocumProfile | null | undefined,
): ProfileVerificationBadge | null {
    if (!profile) return null;
    const accountBadge = badgeFromAccountStatus(profile.accountStatus);
    if (accountBadge) return accountBadge;
    if (isCpsnsVerificationApproved(profile.cpsnsVerificationStatus)) {
        return PROFILE_VERIFICATION_BADGE_VERIFIED;
    }
    if (
        profile.cpsnsVerificationStatus === 'PENDING_REVIEW'
        || profile.cpsnsVerificationStatus === 'UNVERIFIED'
    ) {
        return PROFILE_VERIFICATION_BADGE_UNDER_REVIEW;
    }
    if (profile.cpsnsVerificationStatus === 'REJECTED') {
        return PROFILE_VERIFICATION_BADGE_NOT_VERIFIED;
    }
    return null;
}

export function getHostVerificationStatusBadge(
    profile: HostProfile | null | undefined,
): ProfileVerificationBadge | null {
    if (!profile) return null;
    const accountBadge = badgeFromAccountStatus(profile.accountStatus);
    if (accountBadge) return accountBadge;
    if (isCpsnsVerificationApproved(profile.cpsnsVerificationStatus)) {
        return PROFILE_VERIFICATION_BADGE_VERIFIED;
    }
    if (isHostVerificationPending(profile.cpsnsVerificationStatus)) {
        return PROFILE_VERIFICATION_BADGE_UNDER_REVIEW;
    }
    if (profile.cpsnsVerificationStatus === 'REJECTED') {
        return PROFILE_VERIFICATION_BADGE_NOT_VERIFIED;
    }
    return null;
}
