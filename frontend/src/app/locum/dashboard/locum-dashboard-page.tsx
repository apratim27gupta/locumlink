'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { locumApi, type MyApplication } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { useAuth } from '@/providers/AuthProvider';
import type { LocumProfile } from '@/types';
import { isCpsnsVerified } from '@/lib/cpsnsVerify';
import { relativeHoursOrDaysAgo } from '@/lib/relativeTime';

/** Progress ring: r=22 → circumference used for stroke-dasharray */
const PROFILE_RING_R = 22;
const PROFILE_RING_C = 2 * Math.PI * PROFILE_RING_R;

const NAV = [
  {
    label: 'Browse Opportunities',
    href: '/locum/browse',
    icon: <NavIcon name="browse" />,
  },
  {
    label: 'My Applications',
    href: '/locum/dashboard',
    icon: <NavIcon name="postings" />,
  },
  {
    label: 'Profile',
    href: '/locum/profile',
    icon: <NavIcon name="profile" />,
  },
  {
    label: 'Messages',
    href: '/locum/messages',
    icon: <NavIcon name="messages" />,
  },
  {
    label: 'Resources',
    href: '/locum/resources',
    icon: <NavIcon name="resources" />,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LocumDashboard(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const router = useRouter();
  const { isLoading: authLoading, userId } = useAuth();
  const [tab, setTab] = useState<'recent' | 'upcoming' | 'completed'>('recent');
  const [profile, setProfile] = useState<LocumProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!getToken()) {
      setProfile(null);
      setProfileError(null);
      setApplications([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    locumApi
      .getProfile()
      .then((data) => {
        if (cancelled) return;
        setProfileError(null);
        if (data.exists && data.profile) setProfile(data.profile);
        else setProfile(null);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.message
            : 'Could not load your profile. Please try again.';
        setProfile(null);
        setProfileError(msg);
      });

    locumApi
      .getMyApplications()
      .then(({ applications: apps }) => {
        if (!cancelled) setApplications(apps);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const displayName = profile
    ? `Welcome Dr ${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
    : 'Welcome';

  const completionPct = (() => {
    if (!profile) return 0;
    const specs =
      profile.specialization
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const step1 = !!(
      (profile.firstName ?? '').trim() &&
      (profile.lastName ?? '').trim() &&
      (profile.cpsnsNumber ?? '').trim() &&
      (profile.professionalSummary ?? '').trim() &&
      specs.length
    );
    const step2 = !!(
      (profile.address1 ?? '').trim() &&
      (profile.postalCode ?? '').trim() &&
      (profile.city ?? '').trim() &&
      (profile.province ?? '').trim()
    );
    const step3 = !!(
      (profile.licenseFile ?? '').trim() && (profile.resumeFile ?? '').trim()
    );
    const completed = [step1, step2, step3].filter(Boolean).length;
    return Math.round((completed / 3) * 100);
  })();

  const cpsnsVerified = isCpsnsVerified(profile?.cpsnsNumber);
  const ringPct = Math.min(100, Math.max(0, completionPct)) / 100;
  const ringDash = ringPct * PROFILE_RING_C;

  // Filter by tab
  const today = new Date();
  const tabApps = applications.filter((app) => {
    const startDate = app.jobPosting.startDate
      ? new Date(app.jobPosting.startDate)
      : null;
    const endDate = app.jobPosting.endDate
      ? new Date(app.jobPosting.endDate)
      : null;
    if (tab === 'recent') return true; // all recent applications
    if (tab === 'upcoming')
      return app.status === 'CONFIRMED' && startDate && startDate > today;
    if (tab === 'completed')
      return app.status === 'CONFIRMED' && endDate && endDate < today;
    return false;
  });

  const completedCount = applications.filter(
    (a) => a.status === 'CONFIRMED',
  ).length;

  return (
    <DashLayout
      navItems={NAV}
      activeHref="/locum/dashboard"
      topbarFirstName={profile?.firstName}
      topbarLastName={profile?.lastName}
    >
      {/* Header */}
      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: '#0f1523',
          marginBottom: 3,
        }}
      >
        {displayName}
      </h1>
      <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 18 }}>
        Define and manage organizational, hierarchy, departments, and
        relationships with AI-powered insights
      </p>
      {profileError ? (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 14 }}>
          {profileError}
        </div>
      ) : null}

      {/* Stats */}
      <div
        style={{
          display: 'flex',
          border: '1px solid #e2e5ee',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 16,
          background: '#fff',
        }}
      >
        <div style={{ flex: 1, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: '#5a6478', marginBottom: 4 }}>
            Completed Jobs
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: '#0f1523',
              lineHeight: 1,
            }}
          >
            {loading ? '–' : completedCount}
          </div>
        </div>
      </div>

      {/* Profile nudge */}
      <div
        style={{
          background: '#F4F6FB',
          border: '1.5px solid #3B4FD8',
          borderRadius: 10,
          padding: '0 20px',
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              position: 'relative',
              width: 52,
              height: 52,
              flexShrink: 0,
            }}
          >
            <svg width="52" height="52" viewBox="0 0 52 52">
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
            <img
              src={
                cpsnsVerified
                  ? '/profile-verified.png'
                  : '/profile-incomplete.png'
              }
              alt=""
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 28,
                height: 28,
                objectFit: 'contain',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1523' }}>
              {completionPct < 100
                ? 'Set up your profile to start finding opportunities'
                : cpsnsVerified
                  ? 'Your profile is complete'
                  : 'Profile complete — CPSNS verification required to apply'}
            </div>
            <div style={{ fontSize: 12, color: '#5a6478' }}>
              {completionPct}% Completed
              {completionPct === 100 && cpsnsVerified
                ? ' · CPSNS verified'
                : completionPct === 100 && !cpsnsVerified
                  ? ' · Awaiting CPSNS verification'
                  : ''}
            </div>
          </div>
        </div>
        <button
          onClick={() => router.push('/locum/profile')}
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
            src="/edit-profile.png"
            alt=""
            width={16}
            height={16}
            style={{ flexShrink: 0, objectFit: 'contain' }}
          />
          Edit Profile
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e2e5ee',
          marginBottom: 16,
        }}
      >
        {(['recent', 'upcoming', 'completed'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'transparent',
              fontSize: 12,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#0f1523' : '#8892a4',
              borderBottom:
                tab === t ? '2px solid #0f1523' : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
            }}
          >
            {t === 'recent'
              ? 'Recent Applications'
              : t === 'upcoming'
                ? 'Upcoming Jobs'
                : 'Completed Jobs'}
          </button>
        ))}
      </div>

      {/* Application cards */}
      {loading && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            fontSize: 13,
            color: '#8892a4',
          }}
        >
          Loading…
        </div>
      )}

      {!loading && tabApps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Image
              src="/no-applications.png"
              alt=""
              width={160}
              height={160}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#5a6478',
              marginBottom: 4,
            }}
          >
            No applications yet
          </div>
          <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 20 }}>
            {tab === 'recent'
              ? "You haven't applied to any jobs yet"
              : `No ${tab} jobs`}
          </div>
          {tab === 'recent' && (
            <button
              onClick={() => router.push('/locum/browse')}
              id="empty-state-browse-opportunities"
              style={{
                padding: '10px 22px',
                background: '#3B4FD8',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Browse Opportunities
            </button>
          )}
        </div>
      )}

      {!loading &&
        tabApps.map((app) => {
          const jp = app.jobPosting;
          const statusColor: Record<string, string> = {
            APPLIED: '#3B4FD8',
            SHORTLISTED: '#059669',
            CONFIRMED: '#16a34a',
            REJECTED: '#dc2626',
            WITHDRAWN: '#9CA3AF',
          };
          return (
            <div
              key={app.id}
              style={{
                background: '#fff',
                border: '1px solid #e2e5ee',
                borderRadius: 8,
                padding: '16px 18px',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 4,
                }}
              >
                <div
                  style={{ fontSize: 14, fontWeight: 600, color: '#0f1523' }}
                >
                  {jp.title}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: statusColor[app.status] ?? '#5a6478',
                    padding: '2px 8px',
                    background: '#F9FAFB',
                    borderRadius: 4,
                    border: `1px solid ${statusColor[app.status] ?? '#e2e5ee'}`,
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {app.status}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <Image
                  src="/avatar-clinic.png"
                  alt=""
                  width={18}
                  height={18}
                  style={{ flexShrink: 0, objectFit: 'contain' }}
                />
                <span style={{ fontSize: 13, color: '#5a6478' }}>
                  {jp.hostProfile.practiceName}, {jp.hostProfile.city},{' '}
                  {jp.hostProfile.province}
                </span>
              </div>
              {jp.description?.trim() ? (
                <div
                  style={{
                    fontSize: 13,
                    color: '#5a6478',
                    marginTop: -4,
                    marginBottom: 10,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {jp.description}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                {(jp.startDate || jp.endDate) && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#F1F3F7',
                      padding: '4px 10px',
                      borderRadius: 5,
                      fontSize: 12,
                      color: '#5a6478',
                    }}
                  >
                    <Image
                      src="/calender.png"
                      alt=""
                      width={14}
                      height={14}
                      style={{ flexShrink: 0, objectFit: 'contain' }}
                    />
                    {fmtDate(jp.startDate)} – {fmtDate(jp.endDate)}
                  </span>
                )}
                {(jp.startTime || jp.endTime) && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#F1F3F7',
                      padding: '4px 10px',
                      borderRadius: 5,
                      fontSize: 12,
                      color: '#5a6478',
                    }}
                  >
                    <Image
                      src="/clock.png"
                      alt=""
                      width={14}
                      height={14}
                      style={{ flexShrink: 0, objectFit: 'contain' }}
                    />
                    {fmtTime(jp.startTime)} – {fmtTime(jp.endTime)}
                  </span>
                )}
                <span
                  style={{ fontSize: 12, color: '#8892a4', marginLeft: 'auto' }}
                >
                  {relativeHoursOrDaysAgo(app.appliedAt)}
                </span>
              </div>
            </div>
          );
        })}
    </DashLayout>
  );
}
