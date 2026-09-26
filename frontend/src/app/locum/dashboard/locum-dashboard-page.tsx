'use client';
import { useState, useEffect, useRef } from 'react';
import { useResizableDrawer } from '@/lib/useResizableDrawer';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import LocumProfileStatusBanner from '@/components/LocumProfileStatusBanner';
import { LocumBrowseJobDetail } from '@/components/locum/LocumBrowseJobDetail';
import { LocumApplyModal } from '@/components/locum/LocumApplyModal';
import { InlineAvailabilityEditor } from '@/components/locum/InlineAvailabilityEditor';
import { fetchAllPaginated, locumApi, type BrowseJob, type MyApplication } from '@/lib/api';
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
import { getJobScheduleMode, formatScheduleSummaryText, hasVaryingShiftTimes, isPartialAvailability, applicationCoveredDays, applicationCoveredShiftIds, applicationPartialAvailabilityBadge, formatApplicationSlotLabels, formatSpecificDate, getJobScheduleModel, getPostingDays } from '@/lib/jobSchedule';
import { beforeClientNavigation } from '@/lib/topLoader';
import { CountBadge } from '@/components/CountBadge';
import { canMutateApplicationBeforeOngoing } from '@/lib/locumApplicationActions';

function applicationToBrowseJob(app: MyApplication): BrowseJob {
    const jp = app.jobPosting;
    const hp = jp.hostProfile;
    return {
        id: jp.id,
        title: jp.title,
        description: jp.description ?? '',
        location: jp.location ?? [hp.city, hp.province].filter(Boolean).join(', '),
        createdAt: jp.createdAt ?? app.appliedAt,
        publishedAt: jp.publishedAt ?? null,
        applicationsCount: 0,
        hostProfile: {
            practiceName: hp.practiceName,
            contactFirstName: hp.contactFirstName ?? null,
            contactLastName: hp.contactLastName ?? null,
            cpsnsVerificationStatus: hp.cpsnsVerificationStatus ?? null,
            city: hp.city,
            province: hp.province,
            postalCode: hp.postalCode ?? undefined,
            address: hp.address ?? null,
            address1: hp.address1 ?? null,
            practiceType: hp.practiceType ?? null,
            emr: hp.emr ?? null,
            numPhysicians: hp.numPhysicians ?? null,
            patientVol: hp.patientVol ?? null,
            servicesOffered: hp.servicesOffered ?? [],
            highlights: hp.highlights ?? null,
        },
        startDate: jp.startDate,
        endDate: jp.endDate,
        dates: jp.dates ?? null,
        shifts: jp.shifts ?? null,
        scheduleType: jp.scheduleType ?? null,
        scheduleModel: jp.scheduleModel ?? null,
        startTime: jp.startTime,
        endTime: jp.endTime,
        payPerDay: jp.payPerDay ?? null,
        requiredCredentials: jp.requiredCredentials ?? [],
        keyResponsibilities: jp.keyResponsibilities ?? [],
        minYearsExperience: jp.minYearsExperience ?? null,
        isRural: jp.isRural ?? false,
        accommodationProvided: jp.accommodationProvided ?? false,
        isDeleted: jp.isDeleted,
    };
}

function SlotLabelChips({
  items,
  tone = 'teal',
}: {
  items: string[];
  tone?: 'teal' | 'amber' | 'neutral';
}) {
  if (items.length === 0) return null;
  const styles =
    tone === 'amber'
      ? { color: '#9A3412', bg: '#FFF7ED', border: '#FDBA74' }
      : tone === 'neutral'
        ? { color: '#374151', bg: '#F9FAFB', border: '#E5E7EB' }
        : { color: '#0F766E', bg: 'rgba(15, 118, 110, 0.08)', border: '#99F6E4' };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((label) => (
        <span
          key={label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: styles.bg,
            border: `1px solid ${styles.border}`,
            color: styles.color,
            padding: '4px 9px',
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/** Dates/slots the locum should focus on for this application stage. */
function myShiftFocusForApp(app: MyApplication): { label: string; items: string[] } {
    const jp = app.jobPosting;
    const postingDays = getPostingDays(jp);
    const isSlots = getJobScheduleModel(jp) === 'SLOTS';
    const accepted = app.locumResponse === 'ACCEPTED' || !!app.locumAcceptedAt;

    if (isSlots) {
        const preview = app.acceptPreview;
        if (accepted) {
            return {
                label: 'Your confirmed slots',
                items: formatApplicationSlotLabels(app, jp),
            };
        }
        if (preview) {
            const remainingIds = preview.remainingShiftIds;
            const proposedIds = preview.proposedShiftIds;
            if ((preview.takenShiftIds?.length ?? 0) > 0 && remainingIds) {
                return {
                    label: 'Slots you can still accept',
                    items: formatApplicationSlotLabels(app, jp, remainingIds),
                };
            }
            return {
                label: 'Your proposed availability',
                items: formatApplicationSlotLabels(
                    app,
                    jp,
                    proposedIds ?? applicationCoveredShiftIds(app, jp),
                ),
            };
        }
        if (isPartialAvailability(app)) {
            return {
                label: 'Your proposed availability',
                items: formatApplicationSlotLabels(app, jp),
            };
        }
        return {
            label: 'Posting schedule',
            items: formatApplicationSlotLabels(app, jp, applicationCoveredShiftIds(app, jp)),
        };
    }

    if (accepted) {
        return {
            label: 'Your confirmed shift dates',
            items: applicationCoveredDays(app, postingDays).map(formatSpecificDate),
        };
    }
    if (app.acceptPreview) {
        if (app.acceptPreview.takenDates.length > 0) {
            return {
                label: 'Dates you can still accept',
                items: app.acceptPreview.remainingDates.map(formatSpecificDate),
            };
        }
        return {
            label: 'Your proposed availability',
            items: app.acceptPreview.proposedDates.map(formatSpecificDate),
        };
    }
    if (isPartialAvailability(app)) {
        return {
            label: 'Your proposed availability',
            items: applicationCoveredDays(app, postingDays).map(formatSpecificDate),
        };
    }
    return {
        label: 'Posting schedule',
        items: postingDays.map(formatSpecificDate),
    };
}

const LOCUM_TABS = [
    { id: 'recent' as const, label: 'Recent Applications' },
    { id: 'upcoming' as const, label: 'Upcoming Shifts' },
    { id: 'ongoing' as const, label: 'Ongoing Shifts' },
    { id: 'completed' as const, label: 'Completed Shifts' },
];

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
    {
        label: 'FAQs',
        href: '/locum/faq',
        icon: <NavIcon name="faq"/>,
    },
    { label: 'Settings', href: '/locum/settings', icon: <NavIcon name="settings"/> },
];
function fmtDate(iso: string | null): string {
    return formatLocalCalendarDateForDisplay(iso);
}
function fmtTime(t: string | null): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return '';
    // Convert UTC HH:mm to local time using today's date as carrier
    const utcDate = new Date();
    utcDate.setUTCHours(h, m, 0, 0);
    const localH = utcDate.getHours();
    const localM = utcDate.getMinutes();
    const ampm = localH >= 12 ? 'PM' : 'AM';
    const h12 = localH % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(localM).padStart(2, '0')} ${ampm}`;
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
    const [tab, setTab] = useState<'recent' | 'upcoming' | 'ongoing' | 'completed'>('recent');
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
    const [acceptConfirmAppId, setAcceptConfirmAppId] = useState<string | null>(null);
    const [editAvailabilityAppId, setEditAvailabilityAppId] = useState<string | null>(null);
    const [availabilityBusy, setAvailabilityBusy] = useState(false);
    const [availabilityError, setAvailabilityError] = useState<string | null>(null);
    const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
    const [withdrawConfirmAppId, setWithdrawConfirmAppId] = useState<string | null>(null);
    const [detailAppId, setDetailAppId] = useState<string | null>(null);
    const detailDrawer = useResizableDrawer({
        storageKey: 'l2-locum-application-detail-width',
        defaultWidth: 520,
    });
    const [respondError, setRespondError] = useState<string | null>(null);
    const respondingRef = useRef(false);
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
        fetchAllPaginated((cursor) => locumApi.getMyApplications({ cursor, limit: 100 }))
            .then((apps) => {
            if (!cancelled)
                setApplications(apps);
        })
            .catch(() => {
            if (!cancelled)
                setProfileError('Could not load your applications. Please try again.');
        })
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
    const isUpcomingApplication = (app: MyApplication) => {
        const startDate = localDateFromCalendarInput(
            app.jobPosting.startDate ?? null,
        );
        return app.status === 'CONFIRMED'
            && !!app.locumAcceptedAt
            && startDate
            && startDate.getTime() > todayStart.getTime();
    };
    const isOngoingApplication = (app: MyApplication) => {
        const startDate = localDateFromCalendarInput(
            app.jobPosting.startDate ?? null,
        );
        const endDate = localDateFromCalendarInput(
            app.jobPosting.endDate ?? null,
        );
        return app.status === 'CONFIRMED'
            && !!app.locumAcceptedAt
            && startDate
            && endDate
            && startDate.getTime() <= todayStart.getTime()
            && endDate.getTime() >= todayStart.getTime();
    };
    const isCompletedApplication = (app: MyApplication) => {
        const endDate = localDateFromCalendarInput(
            app.jobPosting.endDate ?? null,
        );
        return app.status === 'CONFIRMED'
            && !!app.locumAcceptedAt
            && endDate
            && endDate.getTime() < todayStart.getTime();
    };
    const isRecentApplication = (app: MyApplication) => {
        // If it belongs to a time-based tab, exclude from Recent
        if (isUpcomingApplication(app)) return false;
        if (isOngoingApplication(app)) return false;
        if (isCompletedApplication(app)) return false;
        return app.status === 'APPLIED'
            || app.status === 'SHORTLISTED'
            || app.status === 'CONFIRMED'
            || app.locumResponse === 'ACCEPTED'
            || app.locumResponse === 'REJECTED';
    };
    const tabApps = applications.filter((app) => {
        if (tab === 'recent')
            return isRecentApplication(app);
        if (tab === 'upcoming')
            return isUpcomingApplication(app);
        if (tab === 'ongoing')
            return isOngoingApplication(app);
        if (tab === 'completed')
            return isCompletedApplication(app);
        return false;
    });
    const locumAcceptedApplication = (a: MyApplication) => a.locumResponse === 'ACCEPTED' || !!a.locumAcceptedAt;
    const acceptedFromApps = applications.filter(locumAcceptedApplication).length;
    const completedFromApps = applications.filter(isCompletedApplication).length;
    const recentCount = applications.filter(isRecentApplication).length;
    const upcomingCount = applications.filter(isUpcomingApplication).length;
    const ongoingCount = applications.filter(isOngoingApplication).length;
    const acceptedCount = shiftStats?.totalAcceptedShifts ?? acceptedFromApps;
    const completedCount = shiftStats?.completedShifts ?? completedFromApps;
    const locumTabCounts: Record<(typeof LOCUM_TABS)[number]['id'], number> = {
        recent: recentCount,
        upcoming: upcomingCount,
        ongoing: ongoingCount,
        completed: completedCount,
    };
    async function respondToPlacement(appId: string, response: 'accept' | 'decline') {
        if (respondingRef.current)
            return;
        respondingRef.current = true;
        setRespondError(null);
        setRespondingAppId(appId);
        try {
            await locumApi.respondToConfirmedPlacement(appId, response);
            const [apps, stats] = await Promise.all([
                fetchAllPaginated((cursor) => locumApi.getMyApplications({ cursor, limit: 100 })),
                locumApi.getDashboardStats(),
            ]);
            setApplications(apps);
            setShiftStats(stats);
            setRejectConfirmAppId(null);
            setAcceptConfirmAppId(null);
        }
        catch (e) {
            setRespondError(e instanceof Error ? e.message : 'Could not update application.');
        }
        finally {
            respondingRef.current = false;
            setRespondingAppId(null);
        }
    }

    async function refreshApplications() {
        const [apps, stats] = await Promise.all([
            fetchAllPaginated((cursor) => locumApi.getMyApplications({ cursor, limit: 100 })),
            locumApi.getDashboardStats(),
        ]);
        setApplications(apps);
        setShiftStats(stats);
    }

    async function saveAvailability(
        appId: string,
        opts: {
            availabilityKind: 'FULL' | 'PARTIAL';
            availableDates: string[];
            shiftIds?: string[];
        },
    ) {
        setAvailabilityBusy(true);
        setAvailabilityError(null);
        try {
            await locumApi.updateApplicationAvailability(appId, opts);
            setEditAvailabilityAppId(null);
            await refreshApplications();
        } catch (e) {
            setAvailabilityError(
                e instanceof Error ? e.message : 'Could not update availability.',
            );
        } finally {
            setAvailabilityBusy(false);
        }
    }

    async function withdrawApplication(app: MyApplication) {
        if (!canMutateApplicationBeforeOngoing(app)) return;
        setWithdrawConfirmAppId(app.id);
    }

    async function confirmWithdrawApplication(app: MyApplication) {
        setWithdrawConfirmAppId(null);
        setWithdrawingId(app.id);
        setRespondError(null);
        try {
            await locumApi.withdrawApplication(app.id);
            await refreshApplications();
        } catch (e) {
            setRespondError(
                e instanceof Error ? e.message : 'Could not withdraw.',
            );
        } finally {
            setWithdrawingId(null);
        }
    }

    const editApp = editAvailabilityAppId
        ? applications.find((a) => a.id === editAvailabilityAppId)
        : null;
    return (<DashLayout navItems={NAV} activeHref="/locum/dashboard" topbarFirstName={profile?.firstName} topbarLastName={profile?.lastName}>
      {editApp ? (
        <LocumApplyModal
          job={applicationToBrowseJob(editApp)}
          mode="edit"
          applying={availabilityBusy}
          error={availabilityError ?? undefined}
          initialKind={editApp.availabilityKind === 'PARTIAL' ? 'PARTIAL' : 'FULL'}
          initialDates={editApp.availableDates ?? []}
          initialShiftIds={editApp.requestedShiftIds ?? []}
          onSubmit={(opts) => void saveAvailability(editApp.id, opts)}
          onClose={() => {
            setEditAvailabilityAppId(null);
            setAvailabilityError(null);
          }}
        />
      ) : null}
      
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
            <span style={{ color: '#000' }}>{loading ? '-' : acceptedCount}</span>
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
            <span style={{ color: '#000' }}>{loading ? '-' : completedCount}</span>
          </p>
        </div>
      </div>

      
      <div style={{
            display: 'flex',
            borderBottom: '1px solid #e2e5ee',
            marginBottom: 16,
            flexShrink: 0,
        }}>
        {LOCUM_TABS.map((t) => (<button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 14px',
                border: 'none',
                background: 'transparent',
                fontSize: 12,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? '#0f1523' : '#8892a4',
                borderBottom: tab === t.id ? '2px solid #0f1523' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textTransform: 'uppercase',
            }}>
            <span className="locum-dash-tab-label">
              {t.label}
              {!loading && (
                <CountBadge count={locumTabCounts[t.id]} variant="tab" />
              )}
            </span>
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
                    : tab === 'ongoing'
                        ? 'No Ongoing Shifts'
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
                const needsLocumResponse = app.status === 'CONFIRMED' && !app.locumAcceptedAt && !postingRemoved;
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
              {postingRemoved && app.status === 'CONFIRMED' && !app.locumAcceptedAt ? (
                <div style={{ marginTop: 10, fontSize: 12, color: '#6B7280' }}>
                  This posting was removed by the host. You can no longer accept or decline.
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
                  {[jp.hostProfile.practiceName, jp.hostProfile.city, jp.hostProfile.province]
                    .map((s) => s?.trim())
                    .filter(Boolean)
                    .join(', ')}
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
                {getJobScheduleMode(jp) !== 'none' && (<span style={{
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
                    {getJobScheduleMode(jp) === 'list'
                        ? formatScheduleSummaryText(jp, '')
                        : `${fmtDate(jp.startDate)} - ${fmtDate(jp.endDate)}`}
                  </span>)}
                {(jp.startTime || jp.endTime) && !(getJobScheduleMode(jp) === 'list' && hasVaryingShiftTimes(jp)) && (<span style={{
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
                    {fmtTime(jp.startTime)} - {fmtTime(jp.endTime)}
                  </span>)}
                {(() => {
                    const label = applicationPartialAvailabilityBadge(app, jp);
                    if (!label) return null;
                    return (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309',
                        padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 700,
                      }}>
                        {label}
                      </span>
                    );
                })()}
                <span style={{ fontSize: 12, color: '#8892a4', marginLeft: 'auto' }}>
                  {relativeHoursOrDaysAgo(app.appliedAt)}
                </span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setDetailAppId(app.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #D0D5DD',
                    background: '#fff',
                    color: '#0F2A7A',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  View shift details
                </button>
                {canMutateApplicationBeforeOngoing(app) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAvailabilityError(null);
                        setEditAvailabilityAppId(app.id);
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #309BB7',
                        background: '#fff',
                        color: '#1B6F86',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      Change availability
                    </button>
                    <button
                      type="button"
                      disabled={withdrawingId === app.id}
                      onClick={() => void withdrawApplication(app)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #FCA5A5',
                        background: '#fff',
                        color: '#B91C1C',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: withdrawingId === app.id ? 'default' : 'pointer',
                      }}
                    >
                      {withdrawingId === app.id ? 'Withdrawing…' : 'Withdraw'}
                    </button>
                  </>
                ) : null}
              </div>
              {needsLocumResponse ? (<div style={{
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: '1px solid #F3F4F6',
                    }}>
                  <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
                    The host confirmed this placement. Review the dates before you accept, or reject to decline.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" disabled={responding} onClick={() => {
                            setRespondError(null);
                            setAcceptConfirmAppId(app.id);
                        }} style={{
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

      {detailAppId ? (() => {
        const app = applications.find((a) => a.id === detailAppId);
        if (!app) return null;
        const st = applicationStatusPresentation(app);
        const myFocus = myShiftFocusForApp(app);
        const preview = app.acceptPreview;
        const highlightIds = applicationCoveredShiftIds(app, app.jobPosting);
        const takenSlotLabels =
          getJobScheduleModel(app.jobPosting) === 'SLOTS' &&
          (preview?.takenShiftIds?.length ?? 0) > 0
            ? formatApplicationSlotLabels(app, app.jobPosting, preview!.takenShiftIds)
            : (preview?.takenDates ?? []).map(formatSpecificDate).filter(Boolean);
        return (
          <div
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.45)',
              zIndex: 10000,
              display: 'flex',
              justifyContent: 'flex-end',
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDetailAppId(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Shift details"
              className="resizable-drawer-panel"
              style={{
                position: 'relative',
                width: detailDrawer.width,
                maxWidth: '100%',
                height: '100%',
                background: '#fff',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                className="resizable-drawer-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                title="Drag to resize"
                onMouseDown={detailDrawer.onHandleMouseDown}
                style={detailDrawer.handleStyle}
              />
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #E5E7EB',
                flexShrink: 0,
              }}>
                <button
                  type="button"
                  onClick={() => setDetailAppId(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#0F2A7A',
                    fontFamily: 'inherit',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                  Back to applications
                </button>
              </div>
              <LocumBrowseJobDetail
                job={applicationToBrowseJob(app)}
                revealHostDetails
                highlightShiftIds={
                  getJobScheduleModel(app.jobPosting) === 'SLOTS' ? highlightIds : null
                }
                open
                style={{ flex: 1, minHeight: 0 }}
                banner={(
                  <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: st.color,
                        padding: '6px 12px',
                        background: st.bg,
                        borderRadius: 8,
                        border: `1px solid ${st.border}`,
                      }}>
                        {st.label}
                      </span>
                      {app.jobPosting.isDeleted ? (
                        <span style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#6B7280',
                          padding: '6px 10px',
                          background: '#E5E7EB',
                          borderRadius: 8,
                        }}>
                          Posting removed
                        </span>
                      ) : null}
                    </div>
                    {canMutateApplicationBeforeOngoing(app) ? (
                      <InlineAvailabilityEditor
                        job={applicationToBrowseJob(app)}
                        label={myFocus.label}
                        initialKind={app.availabilityKind === 'PARTIAL' ? 'PARTIAL' : 'FULL'}
                        initialDates={app.availableDates ?? []}
                        initialShiftIds={app.requestedShiftIds ?? []}
                        saving={availabilityBusy}
                        error={editAvailabilityAppId ? null : availabilityError}
                        onSave={(opts) => void saveAvailability(app.id, opts)}
                      />
                    ) : myFocus.items.length > 0 ? (
                      <div style={{
                        background: '#F0FDFA',
                        border: '1px solid #99F6E4',
                        borderRadius: 10,
                        padding: '12px 14px',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0F766E', marginBottom: 8 }}>
                          {myFocus.label}
                        </div>
                        <SlotLabelChips items={myFocus.items} tone="teal" />
                        {takenSlotLabels.length > 0 ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#9A3412', marginBottom: 6 }}>
                              Already filled by another locum
                            </div>
                            <SlotLabelChips items={takenSlotLabels} tone="amber" />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              />
            </div>
          </div>
        );
      })() : null}

      {acceptConfirmAppId ? (() => {
        const accepting = respondingAppId === acceptConfirmAppId;
        const app = applications.find((a) => a.id === acceptConfirmAppId);
        const preview = app?.acceptPreview;
        const jp = app?.jobPosting;
        const isSlots = jp != null && getJobScheduleModel(jp) === 'SLOTS';
        const taken = isSlots
          ? preview?.takenShiftIds
            ? formatApplicationSlotLabels(app!, jp, preview.takenShiftIds)
            : []
          : (preview?.takenDates ?? []).map(formatSpecificDate).filter(Boolean);
        const remaining = isSlots
          ? preview?.remainingShiftIds
            ? formatApplicationSlotLabels(app!, jp, preview.remainingShiftIds)
            : formatApplicationSlotLabels(app!, jp)
          : (preview?.remainingDates ?? []).map(formatSpecificDate).filter(Boolean);
        const proposed = isSlots
          ? formatApplicationSlotLabels(
              app!,
              jp,
              preview?.proposedShiftIds ?? (app ? applicationCoveredShiftIds(app, jp) : []),
            )
          : (preview?.proposedDates ?? []).map(formatSpecificDate).filter(Boolean);
        const noDaysLeft = Boolean(
          preview &&
            (isSlots
              ? (preview.remainingShiftIds?.length ?? remaining.length) === 0
              : (preview.remainingDates?.length ?? 0) === 0),
        );
        const hasOverlap = taken.length > 0;
        const acceptItems = remaining.length > 0 ? remaining : proposed;
        return (
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
            if (!accepting && e.target === e.currentTarget) setAcceptConfirmAppId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="locum-accept-confirm-title"
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '24px 28px',
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
              fontFamily: 'Inter, sans-serif',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3
              id="locum-accept-confirm-title"
              style={{
                margin: '0 0 10px 0',
                fontSize: 18,
                fontWeight: 600,
                color: '#0B0F1F',
              }}
            >
              {noDaysLeft
                ? isSlots
                  ? 'No slots left to accept'
                  : 'No days left to accept'
                : 'Accept this placement?'}
            </h3>
            {noDaysLeft ? (
              <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
                {isSlots
                  ? 'All of the slots from your availability were already filled by another locum who accepted first. You can reject this confirmation or wait for the host to update it.'
                  : 'All of the days from your availability were already filled by another locum who accepted first. You can reject this confirmation or wait for the host to update it.'}
              </p>
            ) : (
              <div style={{ margin: '0 0 24px 0', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
                {hasOverlap ? (
                  <>
                    <p style={{ margin: '0 0 12px 0' }}>
                      {isSlots
                        ? 'Some slots from your proposed availability are already filled by another locum who accepted first.'
                        : 'Some days from your proposed availability are already filled by another locum who accepted first.'}
                    </p>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#9A3412', marginBottom: 6 }}>
                        Already filled
                      </div>
                      <SlotLabelChips items={taken} tone="amber" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#047857', marginBottom: 6 }}>
                        Accept for
                      </div>
                      <SlotLabelChips items={remaining} tone="teal" />
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ margin: '0 0 10px 0' }}>
                      You will accept this shift for:
                    </p>
                    {acceptItems.length > 0 ? (
                      <SlotLabelChips items={acceptItems} tone="teal" />
                    ) : (
                      <p style={{ margin: 0, fontWeight: 700, color: '#0B0F1F' }}>
                        {isSlots ? 'the confirmed slots' : 'the confirmed dates'}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                disabled={accepting}
                onClick={() => setAcceptConfirmAppId(null)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: '1px solid #D0D5DD',
                  borderRadius: 8,
                  background: '#fff',
                  color: '#374151',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: accepting ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: accepting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              {!noDaysLeft ? (
                <button
                  type="button"
                  disabled={accepting}
                  onClick={() => void respondToPlacement(acceptConfirmAppId, 'accept')}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: 'none',
                    borderRadius: 8,
                    background: accepting ? '#94D3AF' : 'linear-gradient(180deg,#22C55E 0%,#16A34A 100%)',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: accepting ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {accepting
                    ? 'Accepting…'
                    : hasOverlap
                      ? isSlots
                        ? 'Accept for these slots'
                        : 'Accept for these dates'
                      : 'Accept'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        );
      })() : null}
      {rejectConfirmAppId ? (() => {
        const rejecting = respondingAppId === rejectConfirmAppId;
        return (
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
            if (!rejecting && e.target === e.currentTarget) setRejectConfirmAppId(null);
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
              Are you sure you want to reject?
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
                disabled={rejecting}
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
                  cursor: rejecting ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: rejecting ? 0.6 : 1,
                }}
              >
                No
              </button>
              <button
                type="button"
                disabled={rejecting}
                onClick={() => void respondToPlacement(rejectConfirmAppId, 'decline')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: rejecting ? '#F87171' : '#DC2626',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: rejecting ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {rejecting ? 'Rejecting…' : 'Yes, reject'}
              </button>
            </div>
          </div>
        </div>
        );
      })() : null}
      {withdrawConfirmAppId ? (() => {
        const app = applications.find((a) => a.id === withdrawConfirmAppId);
        if (!app) return null;
        const wasAccepted = app.locumResponse === 'ACCEPTED' || !!app.locumAcceptedAt;
        return (
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
              if (e.target === e.currentTarget) setWithdrawConfirmAppId(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '24px 28px',
                maxWidth: 480,
                width: '100%',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600, color: '#0B0F1F' }}>
                Withdraw from this placement?
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
                The host will be notified. {wasAccepted
                  ? 'Because you already accepted, cancellation policy applies to the host match fee.'
                  : 'Your application will be withdrawn.'}
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setWithdrawConfirmAppId(null)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: '1px solid #D0D5DD',
                    borderRadius: 8,
                    background: '#fff',
                    color: '#374151',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmWithdrawApplication(app)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: 'none',
                    borderRadius: 8,
                    background: '#DC2626',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </DashLayout>);
}
