import type { HostProfile } from '@/types';
import {
    isCpsnsVerificationApproved,
    isHostVerificationPending,
} from '@/lib/cpsnsVerify';
import type { ProfileStatusGlyphVariant } from '@/components/ProfileStatusGlyph';

export type HostProfileStatusCard = {
    title: string;
    subtitle: string;
    glyphVariant: ProfileStatusGlyphVariant;
};

export function getHostProfileStatusCard(
    profile: HostProfile | null | undefined,
    completionPct: number,
): HostProfileStatusCard {
    const allDone = completionPct === 100;
    const verified = isCpsnsVerificationApproved(profile?.cpsnsVerificationStatus);

    if (profile?.accountStatus === 'SUSPENDED') {
        const note = profile.suspensionNote?.trim();
        return {
            title: 'Account suspended',
            subtitle:
                note ||
                'Your account has been suspended. Contact support for assistance.',
            glyphVariant: 'suspended',
        };
    }
    if (profile?.cpsnsVerificationStatus === 'REJECTED') {
        const reason = profile.rejectionReason?.trim();
        return {
            title: 'Your profile has been rejected',
            subtitle: reason
                ? reason
                : 'Update your profile and resubmit for review.',
            glyphVariant: 'rejected',
        };
    }
    if (verified) {
        return {
            title: 'Your profile has been verified',
            subtitle: allDone
                ? '100% completed · CPSNS verified'
                : `${completionPct}% completed · CPSNS verified`,
            glyphVariant: 'verified',
        };
    }
    if (isHostVerificationPending(profile?.cpsnsVerificationStatus)) {
        const queueLabel =
            profile?.cpsnsVerificationStatus === 'PENDING_REVIEW'
                ? 'Under verification'
                : 'Under verification';
        return {
            title: 'Your account is under verification',
            subtitle: allDone
                ? `100% completed · ${queueLabel}`
                : `${completionPct}% completed · ${queueLabel}`,
            glyphVariant: 'underReview',
        };
    }
    return {
        title: 'Set up your complete profile',
        subtitle: `${completionPct}% Completed`,
        glyphVariant: 'incomplete',
    };
}

export type HostAccountNotice = {
    title: string;
    message: string;
    variant: 'rejected' | 'suspended';
};

export function getHostAccountNotice(
    profile: HostProfile | null | undefined,
): HostAccountNotice | null {
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
