'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { ProfileStatusGlyph } from '@/components/ProfileStatusGlyph';
import { locumApi, type MyApplication } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { useAuth } from '@/providers/AuthProvider';
import type { LocumProfile } from '@/types';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import { locumProfileCompletionPct } from '@/lib/locumProfileCompletion';
import { relativeHoursOrDaysAgo } from '@/lib/relativeTime';
import { beforeClientNavigation } from '@/lib/topLoader';
const PROFILE_RING_R = 22;
const PROFILE_RING_C = 2 * Math.PI * PROFILE_RING_R;
const NAV = [
    {
        label: 'Browse Opportunities',
        href: '/locum/browse',
        icon: <NavIcon name="browse"/>,
    },
    {
        label: 'My Applications',
        href: '/locum/dashboard',
        icon: <NavIcon name="postings"/>,
    },
    {
        label: 'Profile',
        href: '/locum/profile',
        icon: <NavIcon name="profile"/>,
    },
    {
        label: 'Messages',
        href: '/locum/messages',
        icon: <NavIcon name="messages"/>,
    },
    {
        label: 'Resources',
        href: '/locum/resources',
        icon: <NavIcon name="resources"/>,
    },
];
function fmtDate(iso: string | null): string {
    if (!iso)
        return '';
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    });
}
function fmtTime(t: string | null): string {
    if (!t)
        return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}
function applicationStatusPresentation(app: MyApplication): {
    label: string;
    bg: string;
    border: string;
    color: string;
} {
    switch (app.status) {
        case 'CONFIRMED':
            if (app.locumResponse === 'ACCEPTED')
                return {
                    label: 'Accepted',
                    bg: '#ECFDF5',
                    border: '#A7F3D0',
                    color: '#047857',
                };
            return {
                label: 'Host Confirmed',
                bg: '#FFFBEB',
                border: '#FDE68A',
                color: '#B45309',
            };
        case 'APPLIED':
            return {
                label: 'Applied',
                bg: '#F9FAFB',
                border: '#BFDBFE',
                color: '#3B4FD8',
            };
        case 'SHORTLISTED':
            return {
                label: 'Shortlisted',
                bg: '#ECFDF5',
                border: '#A7F3D0',
                color: '#059669',
            };
        case 'REJECTED':
            return {
                label: 'Rejected',
                bg: '#FEF2F2',
                border: '#FECACA',
                color: '#DC2626',
            };
        case 'WITHDRAWN':
            if (app.locumResponse === 'REJECTED')
                return {
                    label: 'Rejected',
                    bg: '#FEF2F2',
                    border: '#FECACA',
                    color: '#DC2626',
                };
            return {
                label: 'Withdrawn',
                bg: '#F9FAFB',
                border: '#E5E7EB',
                color: '#9CA3AF',
            };
        default:
            return {
                label: app.status,
                bg: '#F9FAFB',
                border: '#e2e5ee',
                color: '#5a6478',
            };
    }
}
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
    const [respondingAppId, setRespondingAppId] = useState<string | null>(null);
    const [respondError, setRespondError] = useState<string | null>(null);
    useEffect(() => {
        if (authLoading)
            return;
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
            if (cancelled)
                return;
            setProfileError(null);
            if (data.exists && data.profile)
                setProfile(data.profile);
            else
                setProfile(null);
        })
            .catch((e) => {
            if (cancelled)
                return;
            const msg = e instanceof Error
                ? e.message
                : 'Could not load your profile. Please try again.';
            setProfile(null);
            setProfileError(msg);
        });
        locumApi
            .getMyApplications()
            .then(({ applications: apps }) => {
            if (!cancelled)
                setApplications(apps);
        })
            .catch(() => { })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [authLoading, userId]);
    const displayName = (() => {
        if (!profile)
            return 'Welcome Dr';
        const f = profile.firstName?.trim() ?? '';
        const l = profile.lastName?.trim() ?? '';
        const full = `${f} ${l}`.trim();
        if (!full)
            return 'Welcome Dr';
        return `Welcome Dr ${full}`;
    })();
    const completionPct = locumProfileCompletionPct(profile);
    const cpsnsVerified = isCpsnsVerificationApproved(profile?.verificationStatus);
    const ringPct = Math.min(100, Math.max(0, completionPct)) / 100;
    const ringDash = ringPct * PROFILE_RING_C;
    const today = new Date();
    const tabApps = applications.filter((app) => {
        const startDate = app.jobPosting.startDate
            ? new Date(app.jobPosting.startDate)
            : null;
        const endDate = app.jobPosting.endDate
            ? new Date(app.jobPosting.endDate)
            : null;
        if (tab === 'recent')
            return app.status === 'APPLIED' || app.status === 'CONFIRMED' || app.locumResponse === 'ACCEPTED' || app.locumResponse === 'REJECTED';
        if (tab === 'upcoming')
            return app.status === 'CONFIRMED' &&
                !!app.locumAcceptedAt &&
                startDate &&
                startDate > today;
        if (tab === 'completed')
            return app.status === 'CONFIRMED' &&
                !!app.locumAcceptedAt &&
                endDate &&
                endDate < today;
        return false;
    });
    const acceptedCount = applications.filter((a) => a.locumResponse === 'ACCEPTED').length;
    const completedCount = applications.filter((a) => {
        if (a.locumResponse !== 'ACCEPTED' || !a.jobPosting.endDate)
            return false;
        return new Date(a.jobPosting.endDate) < today;
    }).length;
    async function respondToPlacement(appId: string, response: 'accept' | 'decline') {
        setRespondError(null);
        setRespondingAppId(appId);
        try {
            await locumApi.respondToConfirmedPlacement(appId, response);
            const { applications: apps } = await locumApi.getMyApplications();
            setApplications(apps);
        }
        catch (e) {
            setRespondError(e instanceof Error ? e.message : 'Could not update application.');
        }
        finally {
            setRespondingAppId(null);
        }
    }
    return (<DashLayout navItems={NAV} activeHref="/locum/dashboard" topbarFirstName={profile?.firstName} topbarLastName={profile?.lastName}>
      
      <h1 style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            fontFamily: 'Inter, sans-serif',
            fontSize: 22,
            fontWeight: 700,
            lineHeight: '120%',
            color: '#0f1523',
            margin: 0,
            marginBottom: 3,
            flexShrink: 0,
            textTransform: 'capitalize',
        }}>
        <span>{displayName}</span>
        {profile && cpsnsVerified ? (<span style={{ display: 'inline-flex', alignItems: 'center' }} title="CPSNS verified" aria-label="CPSNS verified">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, verticalAlign: 'middle' }}>
              <path d="M12 3.25 19 5.9v5.25c0 4.45-2.82 7.95-7 9.6-4.18-1.65-7-5.15-7-9.6V5.9l7-2.65Z" stroke="#1B31D2" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M8.6 12.1 10.9 14.4 15.7 9.6" stroke="#1B31D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>) : null}
      </h1>
      <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 18 }}></p>
      {profileError ? (<div style={{ fontSize: 12, color: '#dc2626', marginBottom: 14 }}>
          {profileError}
        </div>) : null}

      
      <div style={{
            display: 'flex',
            border: '1px solid #e2e5ee',
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 16,
            background: '#fff',
            flexShrink: 0,
        }}>
        <div style={{ flex: 1, flexShrink: 0, padding: '18px 18px', borderRight: '1px solid #e2e5ee' }}>
          <div style={{ fontSize: 'var(--font-small)', color: '#5a6478', marginBottom: 4 }}>
            Total Accepted
          </div>
          <div style={{
            fontSize: 'var(--font-heading)',
            fontWeight: 'var(--font-weight-bold)',
            color: '#0f1523',
            lineHeight: 1,
        }}>
            {loading ? '–' : acceptedCount}
          </div>
        </div>
        <div style={{ flex: 1, flexShrink: 0, padding: '18px 18px' }}>
          <div style={{ fontSize: 'var(--font-small)', color: '#5a6478', marginBottom: 4 }}>
            Completed Jobs
          </div>
          <div style={{
            fontSize: 'var(--font-heading)',
            fontWeight: 'var(--font-weight-bold)',
            color: '#0f1523',
            lineHeight: 1,
        }}>
            {loading ? '–' : completedCount}
          </div>
        </div>
      </div>

      
      <div style={{
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
            flexShrink: 0,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            position: 'relative',
            width: 52,
            height: 52,
            flexShrink: 0,
        }}>
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r={PROFILE_RING_R} fill="none" stroke="#E5E7EB" strokeWidth="4"/>
              <circle cx="26" cy="26" r={PROFILE_RING_R} fill="none" stroke="#22C55E" strokeWidth="4" strokeDasharray={`${ringDash} ${PROFILE_RING_C}`} strokeLinecap="round" transform="rotate(-90 26 26)"/>
            </svg>
            <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
        }}>
              <ProfileStatusGlyph variant={cpsnsVerified ? 'verified' : 'incomplete'} size={28}/>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-heading)', fontWeight: 'var(--font-weight-bold)', color: '#0f1523' }}>
              {completionPct < 100
            ? 'Set up your profile to start finding opportunities'
            : cpsnsVerified
                ? 'Your profile is complete'
                : 'Profile complete — CPSNS verification required to apply'}
            </div>
            <div style={{ fontSize: 'var(--font-small)', color: '#5a6478' }}>
              {completionPct}% Completed
              {completionPct === 100 && cpsnsVerified
            ? ' · CPSNS verified'
            : completionPct === 100 && !cpsnsVerified
                ? ' · Awaiting CPSNS verification'
                : ''}
            </div>
          </div>
        </div>
        <button onClick={() => {
            beforeClientNavigation('/locum/profile');
            router.push('/locum/profile');
        }} style={{
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
        }}>
          <Image src="/edit-profile.png" alt="" width={16} height={16} style={{ flexShrink: 0, objectFit: 'contain' }}/>
          Edit Profile
        </button>
      </div>

      
      <div style={{
            display: 'flex',
            borderBottom: '1px solid #e2e5ee',
            marginBottom: 16,
            flexShrink: 0,
        }}>
        {(['recent', 'upcoming', 'completed'] as const).map((t) => (<button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 14px',
                border: 'none',
                background: 'transparent',
                fontSize: 12,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? '#0f1523' : '#8892a4',
                borderBottom: tab === t ? '2px solid #0f1523' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textTransform: 'uppercase',
            }}>
            {t === 'recent'
                ? 'Recent Applications'
                : t === 'upcoming'
                    ? 'Upcoming Jobs'
                    : 'Completed Jobs'}
          </button>))}
      </div>

      {respondError ? (<div style={{
                fontSize: 12,
                color: '#DC2626',
                marginBottom: 12,
            }}>
          {respondError}
        </div>) : null}

      <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: 4,
        }}>
      {loading && (<div style={{
                textAlign: 'center',
                padding: '40px',
                fontSize: 13,
                color: '#8892a4',
            }}>
          Loading…
        </div>)}

      {!loading && tabApps.length === 0 && (<div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 12,
            }}>
            <Image src="/no-applications.png" alt="" width={160} height={160} style={{ objectFit: 'contain' }}/>
          </div>
          <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: '#5a6478',
                marginBottom: 4,
            }}>
            No applications yet
          </div>
          <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 20 }}>
            {tab === 'recent'
                ? "You haven't applied to any jobs yet"
                : `No ${tab} jobs`}
          </div>
          {tab === 'recent' && (<button onClick={() => {
                    beforeClientNavigation('/locum/browse');
                    router.push('/locum/browse');
                }} id="empty-state-browse-opportunities" style={{
                    padding: '10px 22px',
                    background: '#3B4FD8',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                }}>
              Browse Opportunities
            </button>)}
        </div>)}

      {!loading &&
            tabApps.map((app) => {
                const jp = app.jobPosting;
                const st = applicationStatusPresentation(app);
                const responding = respondingAppId === app.id;
                const needsLocumResponse = app.status === 'CONFIRMED' && !app.locumAcceptedAt;
                return (<div key={app.id} style={{
                        background: '#fff',
                        border: '1px solid #e2e5ee',
                        borderRadius: 8,
                        padding: '16px 18px',
                        marginBottom: 10,
                    }}>
              <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 4,
                    }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1523' }}>
                  {jp.title}
                </div>
                <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        color: st.color,
                        padding: '8px 16px',
                        background: st.bg,
                        borderRadius: 8,
                        border: `1px solid ${st.border}`,
                        flexShrink: 0,
                        marginLeft: 8,
                    }}>
                  {st.label}
                </span>
              </div>
              <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 8,
                    }}>
                <Image src="/avatar-clinic.png" alt="" width={18} height={18} style={{ flexShrink: 0, objectFit: 'contain' }}/>
                <span style={{ fontSize: 13, color: '#5a6478' }}>
                  {jp.hostProfile.practiceName}, {jp.hostProfile.city},{' '}
                  {jp.hostProfile.province}
                </span>
              </div>
              {jp.description?.trim() ? (<div style={{
                            fontSize: 13,
                            color: '#5a6478',
                            marginTop: -4,
                            marginBottom: 10,
                            whiteSpace: 'pre-line',
                        }}>
                  {jp.description}
                </div>) : null}
              <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        flexWrap: 'wrap',
                    }}>
                {(jp.startDate || jp.endDate) && (<span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            background: '#F1F3F7',
                            padding: '4px 10px',
                            borderRadius: 5,
                            fontSize: 12,
                            color: '#5a6478',
                        }}>
                    <Image src="/calender.png" alt="" width={14} height={14} style={{ flexShrink: 0, objectFit: 'contain' }}/>
                    {fmtDate(jp.startDate)} – {fmtDate(jp.endDate)}
                  </span>)}
                {(jp.startTime || jp.endTime) && (<span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            background: '#F1F3F7',
                            padding: '4px 10px',
                            borderRadius: 5,
                            fontSize: 12,
                            color: '#5a6478',
                        }}>
                    <Image src="/clock.png" alt="" width={14} height={14} style={{ flexShrink: 0, objectFit: 'contain' }}/>
                    {fmtTime(jp.startTime)} – {fmtTime(jp.endTime)}
                  </span>)}
                <span style={{ fontSize: 12, color: '#8892a4', marginLeft: 'auto' }}>
                  {relativeHoursOrDaysAgo(app.appliedAt)}
                </span>
              </div>
              {needsLocumResponse ? (<div style={{
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: '1px solid #F3F4F6',
                    }}>
                  <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
                    The host confirmed this placement. Accept to finalize or reject to decline.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" disabled={responding} onClick={() => void respondToPlacement(app.id, 'accept')} style={{
                            padding: '9px 18px',
                            borderRadius: 8,
                            border: 'none',
                            cursor: responding ? 'default' : 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: 'inherit',
                            color: '#fff',
                            background: responding ? '#94D3AF' : 'linear-gradient(180deg,#22C55E 0%,#16A34A 100%)',
                            boxShadow: responding ? 'none' : '0 1px 2px rgba(22,163,74,0.35)',
                        }}>
                      {responding ? 'Saving…' : 'Accept'}
                    </button>
                    <button type="button" disabled={responding} onClick={() => void respondToPlacement(app.id, 'decline')} style={{
                            padding: '9px 18px',
                            borderRadius: 8,
                            border: '1px solid #FCA5A5',
                            cursor: responding ? 'default' : 'pointer',
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            color: '#B91C1C',
                            background: '#fff',
                        }}>
                      Reject
                    </button>
                  </div>
                </div>) : null}
            </div>);
            })}
      </div>
    </DashLayout>);
}
