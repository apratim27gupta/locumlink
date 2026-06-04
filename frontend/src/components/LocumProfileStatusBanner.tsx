'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ProfileStatusGlyph } from '@/components/ProfileStatusGlyph';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import { getLocumDashboardStatusBadge } from '@/lib/locumAccountNotice';
import { locumProfileCompletionPct } from '@/lib/locumProfileCompletion';
import { beforeClientNavigation } from '@/lib/topLoader';
import type { LocumProfile } from '@/types';
import VerificationStatusPill from '@/components/VerificationStatusPill';

const PROFILE_RING_R = 22;
const PROFILE_RING_C = 2 * Math.PI * PROFILE_RING_R;

type Props = {
  profile: LocumProfile | null | undefined;
  /** Live completion while editing; defaults to profile-based calculation. */
  completionPct?: number;
  showEditButton?: boolean;
};

export default function LocumProfileStatusBanner({
  profile,
  completionPct: completionOverride,
  showEditButton = false,
}: Props) {
  const router = useRouter();
  const completionPct =
    completionOverride ?? locumProfileCompletionPct(profile);
  const cpsnsVerified = isCpsnsVerificationApproved(
    profile?.cpsnsVerificationStatus,
  );
  const statusBadge = getLocumDashboardStatusBadge(profile);
  const ringPct = Math.min(100, Math.max(0, completionPct)) / 100;
  const ringDash = ringPct * PROFILE_RING_C;

  return (
    <div
      className="locum-profile-banner"
      style={{
        background: '#F4F6FB',
        border: '1.5px solid #3B4FD8',
        borderRadius: 10,
        padding: showEditButton ? '0 20px' : '0 16px',
        height: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div
          style={{
            position: 'relative',
            width: 52,
            height: 52,
            flexShrink: 0,
          }}
        >
          <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
            <circle
              cx="26"
              cy="26"
              r={PROFILE_RING_R}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="4"
            />
            <circle
              cx="26"
              cy="26"
              r={PROFILE_RING_R}
              fill="none"
              stroke="#22C55E"
              strokeWidth="4"
              strokeDasharray={`${ringDash} ${PROFILE_RING_C}`}
              strokeLinecap="round"
              transform="rotate(-90 26 26)"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
            }}
          >
            <ProfileStatusGlyph
              variant={cpsnsVerified ? 'verified' : 'incomplete'}
              size={28}
            />
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            className="locum-profile-banner-text"
            style={{
              fontSize: 'var(--font-heading)',
              fontWeight: 'var(--font-weight-bold)',
              color: '#0f1523',
            }}
          >
            {completionPct < 100
              ? 'Set up your profile to start finding opportunities'
              : cpsnsVerified
                ? 'Your profile is complete'
                : 'Profile complete — CPSNS verification required to apply'}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 'var(--font-small)', color: '#5a6478' }}>
              {completionPct}% Completed
            </span>
            {statusBadge ? <VerificationStatusPill {...statusBadge} /> : null}
          </div>
        </div>
      </div>
      {showEditButton ? (
        <button
          type="button"
          onClick={() => {
            beforeClientNavigation('/locum/profile');
            router.push('/locum/profile');
          }}
          className="locum-profile-banner-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: '#fff',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            color: '#0f1523',
            flexShrink: 0,
          }}
        >
          <Image
            src="/edit-profile.svg"
            alt=""
            width={16}
            height={16}
            style={{ flexShrink: 0, objectFit: 'contain' }}
          />
          Edit Profile
        </button>
      ) : null}
    </div>
  );
}
