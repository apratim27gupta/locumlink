'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import LocumProfileStatusBanner from '@/components/LocumProfileStatusBanner';
import { locumApi, type MyApplication } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { useAuth } from '@/providers/AuthProvider';
import type { LocumProfile } from '@/types';
import { NameWithVerifiedShield } from '@/components/NameWithVerifiedShield';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import { locumProfileCompletionPct } from '@/lib/locumProfileCompletion';
import {
    formatLocalCalendarDateForDisplay,
    localCalendarDateToIso,
    localDateFromCalendarInput,
    startOfLocalCalendarDay,
} from '@/lib/localDateTime';
import { relativeHoursOrDaysAgo } from '@/lib/relativeTime';
import { beforeClientNavigation } from '@/lib/topLoader';
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
    { label: 'Settings', href: '/locum/settings', icon: <NavIcon name="settings"/> },
];
function fmtDate(iso: string | null): string {
    return formatLocalCalendarDateForDisplay(iso);
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
                label: 'Applied',
                bg: '#F9FAFB',
                border: '#BFDBFE',
                color: '#3B4FD8',
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
    const [shiftStats, setShiftStats] = useState<{
        totalAcceptedShifts: number;
        completedShifts: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [respondingAppId, setRespondingAppId] = useState<string | null>(null);
    const [rejectConfirmAppId, setRejectConfirmAppId] = useState<string | null>(null);
    const [respondError, setRespondError] = useState<string | null>(null);
    useEffect(() => {
        if (authLoading)
            return;
        if (!getToken()) {
            setProfile(null);
            setProfileError(null);
            setApplications([]);
            setShiftStats(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        locumApi
            .getDashboardStats()
            .then((stats) => {
            if (!cancelled)
                setShiftStats(stats);
        })
            .catch(() => {
            if (!cancelled)
                setShiftStats(null);
        });
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
    const cpsnsVerified = isCpsnsVerificationApproved(profile?.cpsnsVerificationStatus);
    const todayStart =
        startOfLocalCalendarDay(localCalendarDateToIso()) ?? new Date();
    const tabApps = applications.filter((app) => {
        const startDate = localDateFromCalendarInput(
            app.jobPosting.startDate ?? null,
        );
        const endDate = localDateFromCalendarInput(
            app.jobPosting.endDate ?? null,
        );
        if (tab === 'recent')
            return app.status === 'APPLIED' || app.status === 'SHORTLISTED' || app.status === 'CONFIRMED' || app.locumResponse === 'ACCEPTED' || app.locumResponse === 'REJECTED';
        if (tab === 'upcoming')
            return app.status === 'CONFIRMED' &&
                !!app.locumAcceptedAt &&
                startDate &&
                startDate.getTime() > todayStart.getTime();
        if (tab === 'completed')
            return app.status === 'CONFIRMED' &&
                !!app.locumAcceptedAt &&
                endDate &&
                endDate.getTime() < todayStart.getTime();
        return false;
    });
    const locumAcceptedApplication = (a: MyApplication) => a.locumResponse === 'ACCEPTED' || !!a.locumAcceptedAt;
    const acceptedFromApps = applications.filter(locumAcceptedApplication).length;
    const completedFromApps = applications.filter((a) => {
        if (!locumAcceptedApplication(a))
            return false;
        const endDate = localDateFromCalendarInput(
            a.jobPosting.endDate ?? null,
        );
        return !!endDate && endDate.getTime() < todayStart.getTime();
    }).length;
    const acceptedCount = shiftStats?.totalAcceptedShifts ?? acceptedFromApps;
    const completedCount = shiftStats?.completedShifts ?? completedFromApps;
    async function respondToPlacement(appId: string, response: 'accept' | 'decline') {
        setRespondError(null);
        setRespondingAppId(appId);
        try {
            await locumApi.respondToConfirmedPlacement(appId, response);
            const [{ applications: apps }, stats] = await Promise.all([
                locumApi.getMyApplications(),
                locumApi.getDashboardStats(),
            ]);
            setApplications(apps);
            setShiftStats(stats);
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
        <NameWithVerifiedShield verified={cpsnsVerified}>
            <span>{displayName}</span>
        </NameWithVerifiedShield>
      </h1>
      <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 18 }}></p>
      {profileError ? (<div style={{ fontSize: 12, color: '#dc2626', marginBottom: 14 }}>
          {profileError}
        </div>) : null}

      
      <LocumProfileStatusBanner
        profile={profile}
        completionPct={completionPct}
        showEditButton
      />

      
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
          <p style={{
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-heading)',
            lineHeight: '140%',
            color: '#4A4A4A',
        }}>
            Total Accepted Shifts :{' '}
            <span style={{ color: '#000' }}>{loading ? '–' : acceptedCount}</span>
          </p>
        </div>
        <div style={{ flex: 1, flexShrink: 0, padding: '18px 18px' }}>
          <p style={{
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-heading)',
            lineHeight: '140%',
            color: '#4A4A4A',
        }}>
            Completed Shifts :{' '}
            <span style={{ color: '#000' }}>{loading ? '–' : completedCount}</span>
          </p>
        </div>
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
                    ? 'Upcoming Shifts'
                    : 'Completed Shifts'}
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
            <Image src="/no-applications.svg" alt="" width={160} height={160} style={{ objectFit: 'contain' }}/>
          </div>
          <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: '#5a6478',
                marginBottom: tab === 'upcoming' ? 20 : 4,
            }}>
            {tab === 'recent'
                ? 'No applications yet'
                : tab === 'upcoming'
                    ? 'No Upcoming Shifts'
                    : 'No Completed Shifts'}
          </div>
          {tab === 'recent' ? (
          <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 20 }}>
            You have not applied to any shifts yet
          </div>
          ) : null}
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
                const postingRemoved = Boolean(jp.isDeleted);
                const st = applicationStatusPresentation(app);
                const responding = respondingAppId === app.id;
                const needsLocumResponse = app.status === 'CONFIRMED' && !app.locumAcceptedAt;
                const mutedText = postingRemoved ? '#9CA3AF' : '#5a6478';
                const titleColor = postingRemoved ? '#9CA3AF' : '#0f1523';
                return (<div key={app.id} style={{
                        background: postingRemoved ? '#F9FAFB' : '#fff',
                        border: postingRemoved
                            ? '1px dashed #D1D5DB'
                            : '1px solid #e2e5ee',
                        borderRadius: 8,
                        padding: '16px 18px',
                        marginBottom: 10,
                        opacity: postingRemoved ? 0.9 : 1,
                    }}>
              {postingRemoved ? (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#6B7280',
                    marginBottom: 8,
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: '#E5E7EB',
                    display: 'inline-block',
                  }}
                >
                  Posting removed by host
                </div>
              ) : null}
              <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 4,
                    }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: titleColor }}>
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
                <span style={{ fontSize: 13, color: mutedText }}>
                  {jp.hostProfile.practiceName}, {jp.hostProfile.city},{' '}
                  {jp.hostProfile.province}
                </span>
              </div>
              {jp.description?.trim() ? (<div style={{
                            fontSize: 13,
                            color: mutedText,
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
                            color: mutedText,
                        }}>
                    <Image src="/calender.svg" alt="" width={14} height={14} style={{ flexShrink: 0, objectFit: 'contain' }}/>
                    {fmtDate(jp.startDate)} – {fmtDate(jp.endDate)}
                  </span>)}
                {(jp.startTime || jp.endTime) && (<span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            background: postingRemoved ? '#E5E7EB' : '#F1F3F7',
                            padding: '4px 10px',
                            borderRadius: 5,
                            fontSize: 12,
                            color: mutedText,
                        }}>
                    <Image src="/clock.svg" alt="" width={14} height={14} style={{ flexShrink: 0, objectFit: 'contain' }}/>
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
                    <button type="button" disabled={responding} onClick={() => setRejectConfirmAppId(app.id)} style={{
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

      {rejectConfirmAppId ? (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRejectConfirmAppId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="locum-reject-confirm-title"
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '24px 28px',
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
              fontFamily: 'Inter, sans-serif',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3
              id="locum-reject-confirm-title"
              style={{
                margin: '0 0 10px 0',
                fontSize: 18,
                fontWeight: 600,
                color: '#0B0F1F',
              }}
            >
              Are you sure?
            </h3>
            <p
              style={{
                margin: '0 0 24px 0',
                fontSize: 14,
                color: '#6B7280',
                lineHeight: 1.5,
              }}
            >
              You are about to reject a placement the host already confirmed. This
              cannot be undone from your side.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => setRejectConfirmAppId(null)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: '1px solid #D0D5DD',
                  borderRadius: 8,
                  background: '#fff',
                  color: '#374151',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  const appId = rejectConfirmAppId;
                  setRejectConfirmAppId(null);
                  void respondToPlacement(appId, 'decline');
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#DC2626',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashLayout>);
}
