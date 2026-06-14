'use client';
import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo, type MouseEvent as ReactMouseEvent, } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { getToken } from '@/lib/auth';
import { ensureProfileMarkedCompleteFromServer } from '@/lib/profileCompleteSync';
import { useAuth } from '@/providers/AuthProvider';
import { hostProfileCompletionPct } from '@/lib/hostProfileCompletion';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import { ApiHttpError, fetchAllPaginated, hostApi, isActiveJob, isDraftJob, normalizeHostJob, type Job, type ApplicationRecord, type CreateJobPayload, type DashboardStats} from '@/lib/api';
import { beforeClientNavigation } from '@/lib/topLoader';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { HostProfile } from '@/types';
import { sortByLabel, sortStringsLocale } from '@/lib/sortLocale';
import { NameWithVerifiedShield } from '@/components/NameWithVerifiedShield';
import { EmptyIllustration, PlusIcon, ReopenJobIcon, TrashIcon, UserEditIcon, } from './host-dashboard-icons';
import { ProfileStatusGlyph } from '@/components/ProfileStatusGlyph';
import { getHostProfileStatusCard } from '@/lib/hostAccountNotice';
import VerificationStatusPill from '@/components/VerificationStatusPill';
import { getHostVerificationStatusBadge } from '@/lib/profileVerificationBadge';
import { HostJobDescriptionField, HostJobTitleField, HostKeyResponsibilitiesField, MmDdYyyyDateField } from '@/components/host/HostJobPostingFormFields';
import {
    maxIsoDate,
    isPostingEndDatePassed,
    parseMmDdYyyyToIso,
    todayIsoDateLocal,
    validateJobPostingSchedule,
    getJobScheduleValidationError,
    buildJobScheduleApiFields,
    calendarDatePartFromInput,
    fmtJobCalendarDate,
    localCalendarDateToIso,
    toTimezoneAwareIso,
    compareLocalCalendarDates,
} from '@/lib/hostJobPostingForm';
const HOST_DASH_NAV = [
    { label: 'My Postings', href: '/host/dashboard', icon: <NavIcon name="postings"/> },
    { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile"/> },
    { label: 'Messages', href: '/host/messages', icon: <NavIcon name="messages"/> },
    { label: 'Resources', href: '/host/resources', icon: <NavIcon name="resources"/> },
    { label: 'Settings', href: '/host/settings', icon: <NavIcon name="settings"/> },
];
const TABS = [
    { id: 'active', label: 'Active Posts' },
    { id: 'ongoing', label: 'Confirmed Locum Shifts' },
    { id: 'recent', label: 'Completed Locum Shifts' },
    { id: 'draft', label: 'Draft Locum Shifts' },
    { id: 'deleted', label: 'Deleted Locum Shifts' },
];
const CREDENTIAL_OPTIONS = sortStringsLocale([
    'CPSNS Full License',
    'CFPC Eligible',
    'CMPA coverage',
    'BLS (ACLS preferred)',
    'DEA License',
    'PALS Certified',
]);
type ResponsibilitySectionDef = {
    readonly key: string;
    readonly title: string;
    readonly options: readonly {
        readonly id: string;
        readonly label: string;
    }[];
};
const RESPONSIBILITY_SECTIONS: readonly ResponsibilitySectionDef[] = [
    {
        key: 'core',
        title: 'Core',
        options: sortByLabel([
            { id: 'scheduled', label: 'Scheduled patients' },
            { id: 'walkin', label: 'Walk-in / same-day visits' },
            { id: 'phone_virtual', label: 'Phone / virtual consults' },
            { id: 'labs', label: 'Review labs/imaging' },
            { id: 'rx', label: 'Prescription renewals' },
            { id: 'chronic', label: 'Chronic disease management' },
            { id: 'preventive', label: 'Preventive care' },
        ]),
    },
    {
        key: 'additional',
        title: 'Additional',
        options: sortByLabel([
            { id: 'ltc_rounds', label: 'Long-term care rounds' },
            { id: 'admission', label: 'Admission/discharge coordination' },
        ]),
    },
    {
        key: 'optional',
        title: 'Optional',
        options: sortByLabel([
            { id: 'supervise', label: 'Supervise learners' },
        ]),
    },
];
function emptyResponsibilitySelection(): Record<string, Set<string>> {
    return Object.fromEntries(RESPONSIBILITY_SECTIONS.map((s) => [s.key, new Set<string>()]));
}
function buildResponsibilitySelection(optionIds: readonly string[]): Record<string, Set<string>> {
    const idSet = new Set(optionIds);
    return Object.fromEntries(RESPONSIBILITY_SECTIONS.map((s) => [
        s.key,
        new Set(s.options.filter((o) => idSet.has(o.id)).map((o) => o.id)),
    ]));
}
/** Auto-select key responsibilities for Walk-in, LTC, and Virtual job titles only. */
function autoResponsibilitiesForJobTitle(title: string): Record<string, Set<string>> | null {
    const t = title.trim().toLowerCase();
    if (!t)
        return null;
    if (t.includes('walk-in') || t.includes('walk in'))
        return buildResponsibilitySelection(['walkin', 'rx']);
    if (t.includes('ltc') || t.includes('long-term care') || t.includes('long term care'))
        return buildResponsibilitySelection(['ltc_rounds', 'chronic', 'rx']);
    if (t.includes('virtual'))
        return buildResponsibilitySelection(['phone_virtual']);
    return null;
}
const fieldInp: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #D0D5DD',
    borderRadius: 8,
    fontSize: 14,
    color: '#0B0F1F',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
};
function fmtDate(iso: string | null | undefined): string {
    return fmtJobCalendarDate(iso);
}
function isoToDateInputLocal(iso: string | null | undefined): string {
    if (!iso)
        return '';
    const cal = calendarDatePartFromInput(iso);
    if (cal) {
        const [y, m, d] = cal.split('-');
        return `${y}-${m}-${d}`;
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    return localCalendarDateToIso(d);
}
function isJobPastEndDate(job: Pick<Job, 'endDate'>): boolean {
    return isPostingEndDatePassed(job.endDate ?? null);
}
function dashboardTabForJob(job: Job): 'active' | 'ongoing' | 'recent' | 'draft' {
    const status = String(job.status ?? '').toUpperCase();
    if (status === 'DRAFT')
        return 'draft';
    if (status === 'EXPIRED' || status === 'COMPLETED' || status === 'CANCELLED')
        return 'recent';
    if (status === 'ONGOING')
        return isJobPastEndDate(job) ? 'recent' : 'ongoing';
    if (status === 'ACTIVE' && isJobPastEndDate(job))
        return 'recent';
    return 'active';
}
function jobHasAcceptedLocum(job: Job): boolean {
    if (job.hasAcceptedLocum === true)
        return true;
    return String(job.status ?? '').toUpperCase() === 'ONGOING'
        || String(job.status ?? '').toUpperCase() === 'COMPLETED';
}
/** Completed tab: locum accepted the placement and the shift end date has passed. */
function isCompletedLocumShift(job: Job): boolean {
    if (!isJobPastEndDate(job) || !jobHasAcceptedLocum(job))
        return false;
    const status = String(job.status ?? '').toUpperCase();
    return status === 'COMPLETED' || status === 'ONGOING';
}
/** Confirmed tab: locum accepted; shift is still in progress (end date not passed). */
function isConfirmedLocumShift(job: Job): boolean {
    return String(job.status ?? '').toUpperCase() === 'ONGOING' && !isJobPastEndDate(job);
}
function getLocumDisplayName(app: ApplicationRecord): string {
    const { firstName, lastName, user } = app.locumProfile;
    if (firstName || lastName)
        return `Dr ${firstName ?? ''} ${lastName ?? ''}`.trim();
    return user.email.split('@')[0];
}

function applicationStatusDisplay(status: ApplicationRecord['status']): {
    label: string;
    dotColor: string;
    textColor: string;
} {
    switch (status) {
        case 'SHORTLISTED':
            return { label: 'Shortlisted', dotColor: '#10B981', textColor: '#166534' };
        case 'CONFIRMED':
            return { label: 'Confirmed', dotColor: '#6366F1', textColor: '#4338CA' };
        case 'REJECTED':
            return { label: 'Rejected', dotColor: '#EF4444', textColor: '#991B1B' };
        case 'WITHDRAWN':
            return { label: 'Withdrawn', dotColor: '#9CA3AF', textColor: '#6B7280' };
        case 'APPLIED':
        default:
            return { label: 'Pending', dotColor: '#3B82F6', textColor: '#6B7280' };
    }
}
function DetailsIcon() {
    return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M10.5 2H4.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L10.5 2Z" stroke="#3B4FD8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.5 2v4H15M6.5 9h5M6.5 11.5h5M6.5 7h2" stroke="#3B4FD8" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>);
}
function ScheduleIcon() {
    return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="12" rx="2" stroke="#3B4FD8" strokeWidth="1.4"/>
      <path d="M6 2v3M12 2v3M2 8h14" stroke="#3B4FD8" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>);
}
function RequirementsIcon() {
    return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L11 7h5l-4 3 1.5 5L9 12l-4.5 3L6 10 2 7h5L9 2Z" stroke="#3B4FD8" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
    </svg>);
}
function CalendarIcon() {
    return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3" width="12" height="10" rx="1.5" stroke="#6B7280" strokeWidth="1.2"/>
      <path d="M4.5 1.5v2M9.5 1.5v2M1 6h12" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>);
}
function ActiveBadge() {
    return (<div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 20,
            height: 20,
            borderRadius: 4,
            background: '#1C32D2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>);
}
function Chevron() {
    return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function GrayBadge() {
    return (<div style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: '#F3F4F6',
            border: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>);
}
function CollapsedStep({ icon, label, sub, onClick, }: {
    icon: React.ReactNode;
    label: string;
    sub: string;
    onClick?: () => void;
}) {
    return (<div onClick={onClick} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: '#FAFAFA',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            cursor: onClick ? 'pointer' : 'default',
            position: 'relative',
        }}>
      <div style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: '#EEF0FB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <Chevron />
      <GrayBadge />
    </div>);
}
function UpcomingStep({ icon, label, sub, }: {
    icon: React.ReactNode;
    label: string;
    sub: string;
}) {
    return (<div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: '#FAFAFA',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
        }}>
      <div style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: '#F3F4F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <Chevron />
    </div>);
}
function CompBadge({ change, direction, period, }: {
    change: number;
    direction: 'up' | 'down';
    period: string;
}) {
    const up = direction === 'up';
    return (<div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
        }}>
      <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            background: up ? '#ECFDF5' : '#F9FAFB',
            color: up ? '#059669' : '#9CA3AF',
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
        }}>
        {up ? '↗' : '↘'}
        {change}%
      </span>
      <span style={{ fontSize: 11, color: '#9CA3AF' }}>
        Compared to the previous {period}
      </span>
    </div>);
}
function ReOpenModal({ job, onConfirm, onCancel, }: {
    job: Job;
    onConfirm: (payload: {
        additionalApplicants: number;
        startDate: string;
        endDate: string;
    }) => Promise<void>;
    onCancel: () => void;
}) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [extra, setExtra] = useState('10');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dontShow, setDontShow] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        setStep(1);
        setExtra('10');
        setStartDate(isoToDateInputLocal(job.startDate as string | null | undefined));
        setEndDate(isoToDateInputLocal(job.endDate as string | null | undefined));
        setDontShow(false);
        setBusy(false);
    }, [job.id, job.startDate, job.endDate]);
    async function handlePrimary() {
        if (step === 1) {
            setStep(3);
            return;
        }
        if (!startDate.trim() || !endDate.trim()) {
            window.alert('Choose a start date and an end date.');
            return;
        }
        const todayIso = todayIsoDateLocal();
        if (compareLocalCalendarDates(startDate.trim(), todayIso) < 0
            || compareLocalCalendarDates(endDate.trim(), todayIso) < 0) {
            window.alert('Dates cannot be in the past.');
            return;
        }
        if (compareLocalCalendarDates(endDate.trim(), startDate.trim()) < 0) {
            window.alert('End date must be on or after the start date.');
            return;
        }
        const startIso = toTimezoneAwareIso(startDate.trim(), '12:00');
        const endIso = toTimezoneAwareIso(endDate.trim(), '23:59');
        if (!startIso || !endIso) {
            window.alert('Invalid dates.');
            return;
        }
        const n = Number(extra);
        const additionalApplicants = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
        setBusy(true);
        try {
            await onConfirm({
                additionalApplicants,
                startDate: startIso,
                endDate: endIso,
            });
        }
        catch (e) {
            window.alert(e instanceof Error ? e.message : 'Could not reopen this job.');
        }
        finally {
            setBusy(false);
        }
    }
    function titleForStep(): string {
        if (step === 1)
            return 'Re-open the position';
        if (step === 2)
            return 'Additional applicants';
        return 'Dates for this posting';
    }
    const primaryLabel = busy ? 'Reopening…' : step === 3 ? 'Reopen' : 'Continue';
    return (<>
      <div onClick={onCancel} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,50,130,0.4)',
            zIndex: 300,
        }}/>
      <div className="host-dash-modal" style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#fff',
            borderRadius: 12,
            padding: '28px 32px',
            width: 420,
            zIndex: 301,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            fontFamily: 'Inter, sans-serif',
        }}>
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#0B0F1F' }}>
            {titleForStep()}
          </span>
          <button type="button" onClick={onCancel} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 22,
            color: '#6B7280',
            lineHeight: 1,
            padding: 0,
        }}>
            ×
          </button>
        </div>

        {step === 1 ? (<>
            <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
              This would un-confirm the current Locum, and republish the Job
              post.
            </p>
            <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: '#374151',
                cursor: 'pointer',
                marginBottom: 24,
            }}>
              <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#1C32D2' }}/>
              Don&apos;t show again
            </label>
          </>) : step === 2 ? (<div style={{ marginBottom: 24 }}>
            <label style={lbl}>How many additional applicants can apply?</label>
            <input type="number" min={1} step={1} style={{ ...fieldInp, maxWidth: 160 }} value={extra} onChange={(e) => setExtra(e.target.value)}/>
          </div>) : (<div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={lbl}>Start date</label>
              <input type="date" style={fieldInp} value={startDate} onChange={(e) => setStartDate(e.target.value)}/>
            </div>
            <div>
              <label style={lbl}>End date</label>
              <input type="date" style={fieldInp} value={endDate} onChange={(e) => setEndDate(e.target.value)}/>
            </div>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.45 }}>
              Set the schedule for this republished posting. You can adjust both dates before continuing.
            </p>
          </div>)}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={onCancel} style={{
            padding: '9px 24px',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            background: '#fff',
            color: '#374151',
            fontWeight: 500,
            fontSize: 14,
            cursor: 'pointer',
        }}>
            Cancel
          </button>
          <button type="button" onClick={() => void handlePrimary()} disabled={busy} style={{
            padding: '9px 24px',
            border: 'none',
            borderRadius: 8,
            background: 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.85 : 1,
        }}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </>);
}
function InlineApplicantsTable({ jobId, jobTitle, applications, loading, onViewAll, }: {
    jobId: string;
    jobTitle: string;
    applications: ApplicationRecord[];
    loading: boolean;
    onViewAll: () => void;
}) {
    const router = useRouter();
    const preview = applications.slice(0, 7);
    return (<div style={{
            marginTop: 12,
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            background: '#fff',
            overflow: 'hidden',
        }}>
      
      <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid #F3F4F6',
        }}>
        <span style={{ fontSize: 'var(--font-heading)', color: '#6B7280', fontWeight: 'var(--font-weight-bold)' }}>
          {jobTitle}
        </span>
        <button onClick={onViewAll} style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 'var(--font-body)',
            color: '#1C32D2',
            fontWeight: 'var(--font-weight-bold)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
        }}>
          View all{' '}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke="#1C32D2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      
      <div style={{
            display: 'grid',
            gridTemplateColumns: '32px 1fr 90px 1fr 130px 80px',
            gap: '0 8px',
            padding: '10px 16px',
            borderBottom: '1px solid #F3F4F6',
        }}>
        {['', 'NAME', 'YRS EXP', 'SPECIALIZATION', 'STATUS', 'LOCUM RESPONSE'].map((h, i) => (<span key={i} style={{
                fontSize: 'var(--font-small)',
                fontWeight: 'var(--font-weight-bold)',
                color: '#9CA3AF',
                letterSpacing: '0.06em',
            }}>
            {h}
          </span>))}
      </div>

      {loading && (<div style={{
                padding: '24px',
                textAlign: 'center',
                fontSize: 'var(--font-body)',
                color: '#9CA3AF',
            }}>
          Loading applicants…
        </div>)}

      {!loading && preview.length === 0 && (<div style={{
                padding: '24px',
                textAlign: 'center',
                fontSize: 'var(--font-body)',
                color: '#9CA3AF',
            }}>
          No applicants yet
        </div>)}

      {!loading &&
            preview.map((app, idx) => {
                const statusUi = applicationStatusDisplay(app.status);
                const rawSpec = app.locumProfile.specialty ?? '';
                const specText = String((app.locumProfile as any).specializationText ?? '');
                const fromSpecText = specText.split(',').map((s: string) => s.trim()).filter(Boolean);
                const specs = rawSpec && rawSpec !== 'OTHER'
                    ? [rawSpec.replace(/_/g, ' ')]
                    : fromSpecText.length > 0
                        ? fromSpecText
                        : ['—'];
                return (<div key={app.id} onClick={() => {
                        const href = `/host/applicants/${jobId}`;
                        beforeClientNavigation(href);
                        router.push(href);
                    }} style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 1fr 90px 1fr 130px 80px',
                        gap: '0 8px',
                        padding: '10px 16px',
                        borderBottom: idx < preview.length - 1 ? '1px solid #F9FAFB' : 'none',
                        cursor: 'pointer',
                        alignItems: 'center',
                    }}>
              <span style={{ fontSize: 'var(--font-small)', color: '#9CA3AF' }}>{idx + 1}</span>
              <span style={{ fontSize: 'var(--font-heading)', color: '#0B0F1F', fontWeight: 'var(--font-weight-bold)' }}>
                {getLocumDisplayName(app)}
              </span>
              <span style={{ fontSize: 'var(--font-body)', color: '#6B7280', textAlign: 'center' }}>
                {app.locumProfile.yearsOfExperience ?? '—'}
              </span>
              <div style={{
                        display: 'flex',
                        gap: 4,
                        flexWrap: 'nowrap',
                        overflow: 'hidden',
                    }}>
                {specs.slice(0, 1).map((s) => (<span key={s} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 10px',
                            minHeight: 32,
                            background: '#F3F4F6',
                            border: '1px solid #E5E7EB',
                            borderRadius: 6,
                            fontSize: 'var(--font-small)',
                            lineHeight: '140%',
                            color: '#374151',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                    {s}
                  </span>))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: statusUi.dotColor,
                        flexShrink: 0,
                    }}/>
                <span style={{
                        fontSize: 'var(--font-body)',
                        color: statusUi.textColor,
                    }}>
                  {statusUi.label}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        minWidth: 40,
                        background: app.locumResponse === 'ACCEPTED' ? '#D1FAE5' : app.locumResponse === 'REJECTED' ? '#FEE2E2' : '#F3F4F6',
                        color: app.locumResponse === 'ACCEPTED' ? '#065F46' : app.locumResponse === 'REJECTED' ? '#991B1B' : '#6B7280',
                    }}>
                  {app.locumResponse === 'ACCEPTED' ? 'Accepted' : app.locumResponse === 'REJECTED' ? 'Rejected' : '—'}
                </span>
              </div>
            </div>);
            })}
    </div>);
}
function JobActionsKebabIcon() {
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
      <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
      <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
    </svg>);
}
function canHostShowReopenJob(job: Job): boolean {
    if (job.status === 'DRAFT')
        return false;
    return true;
}
const JOB_ACTIONS_MENU_W = 196;
const JOB_ACTIONS_MENU_EST_H = 168;
function JobCard({ job, expandedJobId, applications, loadingAppsFor, onToggleApplicants, onViewAll, onReOpen, onEdit, onPublish, onJobDeleted, }: {
    job: Job;
    expandedJobId: string | null;
    applications: Record<string, ApplicationRecord[]>;
    loadingAppsFor: string | null;
    onToggleApplicants: (jobId: string) => void;
    onViewAll: (jobId: string) => void;
    onReOpen: (job: Job) => void;
    onEdit: (job: Job) => void;
    onPublish: (job: Job) => void;
    onJobDeleted: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [menuFixedPos, setMenuFixedPos] = useState<{
        top: number;
        left: number;
    } | null>(null);
    const menuWrapRef = useRef<HTMLDivElement>(null);
    const kebabBtnRef = useRef<HTMLButtonElement>(null);
    const portalMenuRef = useRef<HTMLDivElement>(null);
    const updateMenuFixedPos = useCallback(() => {
        const btn = kebabBtnRef.current;
        if (!btn) {
            setMenuFixedPos(null);
            return;
        }
        const r = btn.getBoundingClientRect();
        const pad = 8;
        const gap = 6;
        let top = r.bottom + gap;
        let left = r.right - JOB_ACTIONS_MENU_W;
        if (left < pad)
            left = pad;
        if (left + JOB_ACTIONS_MENU_W > window.innerWidth - pad)
            left = Math.max(pad, window.innerWidth - pad - JOB_ACTIONS_MENU_W);
        if (top + JOB_ACTIONS_MENU_EST_H > window.innerHeight - pad)
            top = Math.max(pad, r.top - JOB_ACTIONS_MENU_EST_H - gap);
        setMenuFixedPos({ top, left });
    }, []);
    useLayoutEffect(() => {
        if (!menuOpen) {
            setMenuFixedPos(null);
            return;
        }
        updateMenuFixedPos();
        window.addEventListener('scroll', updateMenuFixedPos, true);
        window.addEventListener('resize', updateMenuFixedPos);
        return () => {
            window.removeEventListener('scroll', updateMenuFixedPos, true);
            window.removeEventListener('resize', updateMenuFixedPos);
        };
    }, [menuOpen, updateMenuFixedPos]);
    useEffect(() => {
        if (!menuOpen)
            return;
        function onDocMouseDown(e: MouseEvent) {
            const t = e.target as Node;
            if (menuWrapRef.current?.contains(t) || portalMenuRef.current?.contains(t))
                return;
            setMenuOpen(false);
        }
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [menuOpen]);
    const isSoftDeleted = job.isDeleted === true;
    const isExpanded = expandedJobId === job.id;
    const isFilled = !isSoftDeleted && job.status === 'ONGOING';
    const isDraft = !isSoftDeleted && job.status === 'DRAFT';
    const appCount = job.applicationsCount;
    const startFmt = fmtDate(job.startDate);
    const endFmt = fmtDate(job.endDate);
    const pay = job.payPerDay
        ? `$${Number(job.payPerDay).toLocaleString()}/day`
        : null;
    const menuItemBase: React.CSSProperties = {
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        border: 'none',
        background: 'transparent',
        fontSize: 'var(--font-body)',
        fontFamily: 'inherit',
        fontWeight: 'var(--font-weight-normal)',
        color: '#374151',
        cursor: 'pointer',
        display: 'block',
    };
    const showExpiredActiveCard = !isSoftDeleted && job.status === 'ACTIVE' && isJobPastEndDate(job);
    const dimJobUi = showExpiredActiveCard || isSoftDeleted;
    async function handleDeleteJob() {
        if (!window.confirm('Delete this job posting? This cannot be undone.')) {
            setMenuOpen(false);
            return;
        }
        setDeleting(true);
        try {
            await hostApi.deleteJob(job.id);
            setMenuOpen(false);
            onJobDeleted();
        }
        catch (e) {
            window.alert(e instanceof Error ? e.message : 'Could not delete this job.');
        }
        finally {
            setDeleting(false);
        }
    }
    return (<div className="host-dash-job-card" style={{
            border: isSoftDeleted
                ? '1px dashed #D1D5DB'
                : showExpiredActiveCard
                    ? '1px solid #D1D5DB'
                    : '1px solid #E5E7EB',
            borderRadius: 10,
            background: isSoftDeleted
                ? '#F9FAFB'
                : showExpiredActiveCard
                    ? '#F3F4F6'
                    : '#fff',
            padding: '18px 20px',
            boxSizing: 'border-box',
            opacity: showExpiredActiveCard || isSoftDeleted ? 0.92 : 1,
        }}>
      <div className="host-dash-job-card-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
        }}>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 6,
        }}>
            <div style={{
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-heading)',
            color: dimJobUi ? '#6B7280' : '#0B0F1F',
            lineHeight: 1.3,
        }}>
            {job.title}
          </div>
            {showExpiredActiveCard && (<span style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#92400E',
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: 6,
                padding: '3px 8px',
                whiteSpace: 'nowrap',
            }}>
              Posting ended
            </span>)}
          </div>
          {job.description && (<div style={{
                fontSize: 'var(--font-body)',
                color: dimJobUi ? '#9CA3AF' : '#6B7280',
                marginBottom: 12,
                lineHeight: 1.5,
            }}>
              {job.description.length > 130
                ? job.description.slice(0, 130) + '…'
                : job.description}
            </div>)}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
        }}>
            {(startFmt || endFmt) && (<div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <CalendarIcon />
                <span style={{ fontSize: 'var(--font-body)', color: dimJobUi ? '#78716C' : '#374151' }}>
                  {startFmt}
                  {startFmt && endFmt && ' – '}
                  {endFmt}
                </span>
              </div>)}
            {pay && (<span style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-heading)', color: dimJobUi ? '#78716C' : '#0B0F1F' }}>
                {pay}
              </span>)}
          </div>
        </div>

        
        <div className="host-dash-job-card-actions" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            flexShrink: 0,
            gap: isSoftDeleted ? 10 : !isDraft && !isFilled ? 18 : 10,
            minWidth: 120,
        }}>
          {isSoftDeleted ? (<span style={{
                padding: '6px 14px',
                background: '#F3F4F6',
                border: '1px solid #D1D5DB',
                borderRadius: 6,
                color: '#4B5563',
                fontWeight: 'var(--font-weight-bold)',
                fontSize: 'var(--font-small)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
            }}>
              Deleted
            </span>) : (<>
              <div ref={menuWrapRef} style={{ position: 'relative' }}>
                <button ref={kebabBtnRef} type="button" aria-label="Job actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 32,
                padding: 0,
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                background: '#fff',
                color: '#6B7280',
                cursor: 'pointer',
                boxSizing: 'border-box',
            }}>
                  <JobActionsKebabIcon />
                </button>
                {menuOpen && menuFixedPos != null && typeof document !== 'undefined' && createPortal(<div ref={portalMenuRef} role="menu" style={{
                    position: 'fixed',
                    top: menuFixedPos.top,
                    left: menuFixedPos.left,
                    minWidth: JOB_ACTIONS_MENU_W,
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 10,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                    zIndex: 10000,
                    overflow: 'hidden',
                }}>
                    <button type="button" role="menuitem" style={menuItemBase} onClick={() => {
                    onEdit(job);
                    setMenuOpen(false);
                }} onMouseDown={(e) => e.preventDefault()}>
                      <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                        <UserEditIcon stroke="#374151"/>
                        Edit job
                      </span>
                    </button>
                    {isDraft && (<button type="button" role="menuitem" style={menuItemBase} onClick={() => {
                        onPublish(job);
                        setMenuOpen(false);
                    }} onMouseDown={(e) => e.preventDefault()}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 12l5 5L20 7" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Post job
                        </span>
                      </button>)}
                    {canHostShowReopenJob(job) && (<button type="button" role="menuitem" style={menuItemBase} onClick={() => {
                        onReOpen(job);
                        setMenuOpen(false);
                    }} onMouseDown={(e) => e.preventDefault()}>
                        <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                          <ReopenJobIcon stroke="#374151"/>
                          Re-open job
                        </span>
                      </button>)}
                    <button type="button" role="menuitem" disabled={deleting} style={{
                    ...menuItemBase,
                    color: '#B91C1C',
                    borderTop: '1px solid #F3F4F6',
                    cursor: deleting ? 'default' : 'pointer',
                    opacity: deleting ? 0.6 : 1,
                }} onClick={() => void handleDeleteJob()} onMouseDown={(e) => e.preventDefault()}>
                      <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                        <TrashIcon stroke="#B91C1C"/>
                        {deleting ? 'Deleting…' : 'Delete job'}
                      </span>
                    </button>
                  </div>, document.body)}
              </div>

              {isDraft ? (<span style={{
                    padding: '6px 16px',
                    background: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    borderRadius: 6,
                    color: '#92400E',
                    fontWeight: 'var(--font-weight-bold)',
                    fontSize: 'var(--font-small)',
                }}>
                  Draft
                </span>) : (<button type="button" onClick={() => onToggleApplicants(job.id)} style={{
                    padding: '6px 16px',
                    background: isExpanded
                        ? '#EEF0FB'
                        : 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
                    border: 'none',
                    borderRadius: 6,
                    color: isExpanded ? '#1C32D2' : '#fff',
                    fontWeight: 'var(--font-weight-bold)',
                    fontSize: 'var(--font-small)',
                    cursor: 'pointer',
                }}>
                  {appCount} Applicant{appCount !== 1 ? 's' : ''}
                </button>)}
            </>)}
        </div>
      </div>

      
      {isExpanded && !isDraft && !isSoftDeleted && (<InlineApplicantsTable jobId={job.id} jobTitle={job.title} applications={applications[job.id] ?? []} loading={loadingAppsFor === job.id} onViewAll={() => onViewAll(job.id)}/>)}
    </div>);
}
function JobPostingOverlay({ onClose, onSuccess, onDraftSaved, verified = false, }: {
    onClose: () => void;
    onSuccess: (createdJob: Job) => void;
    onDraftSaved?: (job: Job) => void | Promise<void>;
    verified?: boolean;
}) {
    const JOB_POST_PANEL_MIN = 320;
    const JOB_POST_PANEL_MAX_CAP = 1200;
    const [postPanelWidth, setPostPanelWidth] = useState(480);
    const [step, setStep] = useState(1);
    const [jobTitle, setJobTitle] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [respBySection, setRespBySection] = useState<Record<string, Set<string>>>(() => emptyResponsibilitySelection());
    const lastAutoRespJobTitleRef = useRef<string | null>(null);
    const [respCustom, setRespCustom] = useState('');
    const [startDateInput, setStartDateInput] = useState('');
    const [endDateInput, setEndDateInput] = useState('');
    const [startTime, setStartTime] = useState('05:00');
    const [endTime, setEndTime] = useState('14:00');
    const [ratePerDay, setRatePerDay] = useState('');
    const [yearsExp, setYearsExp] = useState('');
    const [credentials, setCredentials] = useState<string[]>([
        'CPSNS Full License',
    ]);
    const [customCredential, setCustomCredential] = useState('');
    const [travelReq, setTravelReq] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [saveDraftPromptOpen, setSaveDraftPromptOpen] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const postedRef = useRef(false);
    const jobDateMinIso = todayIsoDateLocal();
    const startIsoForEndMin = parseMmDdYyyyToIso(startDateInput);
    const jobEndMinIso = startIsoForEndMin
        ? maxIsoDate(jobDateMinIso, startIsoForEndMin)
        : jobDateMinIso;
    const scheduleValidationError = useMemo(() => {
        const startIso = parseMmDdYyyyToIso(startDateInput);
        const endIso = parseMmDdYyyyToIso(endDateInput);
        if (!startIso || !endIso || !startTime.trim() || !endTime.trim())
            return null;
        return getJobScheduleValidationError({
            startDateIso: startIso,
            endDateIso: endIso,
            startTime,
            endTime,
        });
    }, [startDateInput, endDateInput, startTime, endTime]);
    useEffect(() => {
        const trimmed = jobTitle.trim();
        const auto = autoResponsibilitiesForJobTitle(trimmed);
        if (!auto) {
            lastAutoRespJobTitleRef.current = null;
            return;
        }
        const key = trimmed.toLowerCase();
        if (lastAutoRespJobTitleRef.current === key)
            return;
        lastAutoRespJobTitleRef.current = key;
        setRespBySection(auto);
    }, [jobTitle]);
    function toggle(c: string) {
        setCredentials((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
    }
    function addCustomCredential(raw: string) {
        const v = raw.trim();
        if (!v)
            return;
        setCredentials((prev) => (prev.includes(v) ? prev : [...prev, v]));
        setCustomCredential('');
    }
    function toggleResponsibility(sectionKey: string, optionId: string) {
        setRespBySection((prev) => {
            const cur = new Set(prev[sectionKey] ?? []);
            if (cur.has(optionId))
                cur.delete(optionId);
            else
                cur.add(optionId);
            return { ...prev, [sectionKey]: cur };
        });
    }
    function buildKeyResponsibilitiesPayload(): string[] {
        const lines: string[] = [];
        for (const section of RESPONSIBILITY_SECTIONS) {
            const selected = respBySection[section.key] ?? new Set<string>();
            for (const opt of section.options) {
                if (!selected.has(opt.id))
                    continue;
                lines.push(`${section.title}: ${opt.label}`);
            }
        }
        for (const line of respCustom
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)) {
            lines.push(line);
        }
        return lines;
    }
    function hasDraftContent(): boolean {
        if (jobTitle.trim() || jobDescription.trim() || respCustom.trim())
            return true;
        if (startDateInput.trim() || endDateInput.trim() || ratePerDay.trim() || yearsExp.trim())
            return true;
        if (travelReq)
            return true;
        if (credentials.length !== 1 || credentials[0] !== 'CPSNS Full License')
            return true;
        for (const section of RESPONSIBILITY_SECTIONS) {
            if ((respBySection[section.key]?.size ?? 0) > 0)
                return true;
        }
        return false;
    }
    function buildDraftPayload(): CreateJobPayload {
        const startIso = parseMmDdYyyyToIso(startDateInput);
        const endIso = parseMmDdYyyyToIso(endDateInput);
        const rateNum = ratePerDay.trim() ? Number(ratePerDay) : NaN;
        const yearsNum = yearsExp.trim() ? Number(yearsExp) : NaN;
        const keyResponsibilities = buildKeyResponsibilitiesPayload();
        const scheduleFields =
            startIso && endIso && startTime && endTime
                ? buildJobScheduleApiFields({
                    startDateIso: startIso,
                    endDateIso: endIso,
                    startTime,
                    endTime,
                })
                : null;
        return {
            title: jobTitle.trim() || 'Draft locum shift',
            description: jobDescription.trim() || undefined,
            keyResponsibilities: keyResponsibilities.length ? keyResponsibilities : undefined,
            startDate: scheduleFields?.startDate ?? (startIso ? toTimezoneAwareIso(startIso, '00:00') ?? undefined : undefined),
            endDate: scheduleFields?.endDate ?? (endIso ? toTimezoneAwareIso(endIso, '23:59') ?? undefined : undefined),
            startTime: scheduleFields?.startTime ?? (startTime || undefined),
            endTime: scheduleFields?.endTime ?? (endTime || undefined),
            payPerDay: Number.isFinite(rateNum) && rateNum > 0 ? rateNum : undefined,
            minYearsExperience: yearsExp.trim() && Number.isFinite(yearsNum) ? yearsNum : undefined,
            requiredCredentials: credentials,
            travelRequired: travelReq,
            scheduleFlexible: false,
            status: 'DRAFT',
            saveAsDraft: true,
        };
    }
    function handleAttemptClose() {
        if (savingDraft || saveDraftPromptOpen)
            return;
        if (postedRef.current || !hasDraftContent()) {
            onClose();
            return;
        }
        setSaveDraftPromptOpen(true);
    }
    async function confirmSaveDraft() {
        setSavingDraft(true);
        try {
            const { job } = await hostApi.createJob(buildDraftPayload());
            if (job.status !== 'DRAFT') {
                throw new Error('Draft was not saved correctly. Please try again.');
            }
            setSaveDraftPromptOpen(false);
            onDraftSaved?.(job);
            onClose();
        }
        catch (e) {
            window.alert(e instanceof Error ? e.message : 'Could not save draft. Please try again.');
        }
        finally {
            setSavingDraft(false);
        }
    }
    function discardWithoutSave() {
        setSaveDraftPromptOpen(false);
        onClose();
    }
    async function handleDone() {
        if (!jobTitle.trim()) {
            setSubmitError('Please enter a job title.');
            return;
        }
        if (!startDateInput.trim()) {
            setSubmitError('Start date is required.');
            return;
        }
        if (!endDateInput.trim()) {
            setSubmitError('End date is required.');
            return;
        }
        const startIso = parseMmDdYyyyToIso(startDateInput);
        const endIso = parseMmDdYyyyToIso(endDateInput);
        if (!startIso) {
            setSubmitError('Start date must be a valid date in MM-DD-YYYY format.');
            return;
        }
        if (!endIso) {
            setSubmitError('End date must be a valid date in MM-DD-YYYY format.');
            return;
        }
        const scheduleCheck = validateJobPostingSchedule({
            startDateIso: startIso,
            endDateIso: endIso,
            startTime,
            endTime,
        });
        if (!scheduleCheck.valid) {
            setSubmitError(scheduleCheck.message);
            return;
        }
        const scheduleFields = buildJobScheduleApiFields({
            startDateIso: startIso,
            endDateIso: endIso,
            startTime,
            endTime,
        });
        if (!scheduleFields) {
            setSubmitError('Schedule could not be encoded. Check dates and times.');
            return;
        }
        const rateNum = ratePerDay.trim() ? Number(ratePerDay) : NaN;
        if (!Number.isFinite(rateNum) || rateNum <= 0) {
            setSubmitError('Rate per day is required.');
            return;
        }
        const yearsNum = yearsExp.trim() ? Number(yearsExp) : NaN;
        if (yearsExp.trim() && !Number.isFinite(yearsNum)) {
            setSubmitError('Years of experience must be a number.');
            return;
        }
        setSubmitting(true);
        setSubmitError('');
        try {
            const payload: CreateJobPayload = {
                title: jobTitle.trim(),
                description: jobDescription.trim() || undefined,
                keyResponsibilities: buildKeyResponsibilitiesPayload(),
                startDate: scheduleFields.startDate,
                endDate: scheduleFields.endDate,
                startTime: scheduleFields.startTime,
                endTime: scheduleFields.endTime,
                payPerDay: rateNum,
                minYearsExperience: yearsExp.trim() && Number.isFinite(yearsNum) ? yearsNum : undefined,
                requiredCredentials: credentials,
                travelRequired: travelReq,
                scheduleFlexible: false,
                status: verified ? 'ACTIVE' : 'DRAFT',
            };
            const { job } = await hostApi.createJob(payload);
            postedRef.current = true;
            onSuccess(job);
        }
        catch (e: unknown) {
            if (e instanceof ApiHttpError && e.status === 401) {
                setSubmitError('Session expired or not signed in. Open Auth and sign in again, then try posting.');
            }
            else {
                setSubmitError(e instanceof Error
                    ? e.message
                    : 'Failed to create job. Please try again.');
            }
        }
        finally {
            setSubmitting(false);
        }
    }
    function onPostPanelResizeMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = postPanelWidth;
        const onMove = (ev: MouseEvent) => {
            const maxW = Math.min(JOB_POST_PANEL_MAX_CAP, window.innerWidth - 24);
            const dx = startX - ev.clientX;
            setPostPanelWidth(Math.min(Math.max(startW + dx, JOB_POST_PANEL_MIN), maxW));
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }
    return (<>
      {!verified && (<div style={{
            position: 'fixed',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10001,
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: 8,
            padding: '10px 16px',
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            color: '#92400E',
            fontWeight: 500,
            maxWidth: 'calc(100vw - 24px)',
            boxSizing: 'border-box',
            textAlign: 'center',
            lineHeight: 1.4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          ⚠️  CPSNS is not  verified — this job will be saved as a Draft.
        </div>)}
      <div onClick={handleAttemptClose} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,50,130,0.45)',
            zIndex: 200,
            cursor: savingDraft ? 'wait' : 'pointer',
        }}/>
      <div className="host-job-post-panel" style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: postPanelWidth,
            height: '100vh',
            background: '#fff',
            zIndex: 201,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, sans-serif',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}>
        <div className="host-job-post-panel-resize-handle" title="Drag to resize" onMouseDown={onPostPanelResizeMouseDown} style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            zIndex: 5,
            cursor: 'ew-resize',
            background: 'transparent',
        }}/>
        
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 24px 18px',
            borderBottom: '1px solid #F3F4F6',
            flexShrink: 0,
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#0B0F1F' }}>
            Create New Post
          </span>
          <button type="button" onClick={handleAttemptClose} disabled={savingDraft} aria-label="Close" style={{
            background: 'none',
            border: 'none',
            cursor: savingDraft ? 'wait' : 'pointer',
            fontSize: 22,
            color: '#6B7280',
            lineHeight: 1,
            padding: 0,
            opacity: savingDraft ? 0.5 : 1,
        }}>
            ×
          </button>
        </div>

        
        <div className="host-job-post-panel-body" style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            minWidth: 0,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxSizing: 'border-box',
        }}>
          
          {step === 1 ? (<div style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                position: 'relative',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px 10px',
            }}>
                <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#EEF0FB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                  <DetailsIcon />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>
                    Details
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    Define the role and culture.
                  </div>
                </div>
              </div>
              <ActiveBadge />
              <div style={{
                padding: '0 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
            }}>
                <HostJobTitleField
                  value={jobTitle}
                  onChange={setJobTitle}
                  inputStyle={fieldInp}
                  labelStyle={lbl}
                />
                <HostJobDescriptionField
                  value={jobDescription}
                  onChange={setJobDescription}
                  inputStyle={fieldInp}
                  labelStyle={lbl}
                />
                <HostKeyResponsibilitiesField
                  respBySection={respBySection}
                  respCustom={respCustom}
                  onToggle={toggleResponsibility}
                  onCustomChange={setRespCustom}
                  inputStyle={fieldInp}
                  labelStyle={lbl}
                />
              </div>
            </div>) : (<CollapsedStep icon={<DetailsIcon />} label="Details" sub="Define the role and culture." onClick={() => setStep(1)}/>)}

          
          {step === 2 ? (<div style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                position: 'relative',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px 10px',
            }}>
                <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#EEF0FB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                  <ScheduleIcon />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>
                    Schedule
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    Set dates, times, and pay
                  </div>
                </div>
              </div>
              <ActiveBadge />
              <div style={{
                padding: '0 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
            }}>
                <div className="host-job-schedule-grid" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
            }}>
                  <div>
                    <label style={lbl}>Start Date *</label>
                    <MmDdYyyyDateField value={startDateInput} onChange={setStartDateInput} inputStyle={fieldInp} minIso={jobDateMinIso}/>
                  </div>
                  <div>
                    <label style={lbl}>End Date *</label>
                    <MmDdYyyyDateField value={endDateInput} onChange={setEndDateInput} inputStyle={fieldInp} minIso={jobEndMinIso}/>
                  </div>
                </div>
                <div className="host-job-schedule-grid" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
            }}>
                  <div>
                    <label style={lbl}>Start Time *</label>
                    <input type="time" style={fieldInp} value={startTime} onChange={(e) => setStartTime(e.target.value)}/>
                  </div>
                  <div>
                    <label style={lbl}>End Time *</label>
                    <input type="time" style={fieldInp} value={endTime} onChange={(e) => setEndTime(e.target.value)}/>
                  </div>
                </div>
                {scheduleValidationError && (<p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>
                    {scheduleValidationError}
                  </p>)}
                <div>
                  <label style={lbl}>Rate per Day (CAD) *</label>
                  <input style={fieldInp} type="number" value={ratePerDay} onChange={(e) => setRatePerDay(e.target.value)} placeholder="e.g. 2000"/>
                </div>
              </div>
            </div>) : step > 2 ? (<CollapsedStep icon={<ScheduleIcon />} label="Schedule" sub="Set dates, times, and pay" onClick={() => setStep(2)}/>) : (<CollapsedStep icon={<ScheduleIcon />} label="Schedule" sub="Set dates, times, and pay" onClick={() => setStep(2)}/>)}

          
          {step === 3 ? (<div style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                position: 'relative',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px 10px',
            }}>
                <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#EEF0FB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                  <RequirementsIcon />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>
                    Requirements
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    List mandatory licenses and experience
                  </div>
                </div>
              </div>
              <ActiveBadge />
              <div style={{
                padding: '0 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
            }}>
                <div>
                  <label style={lbl}>Years of Experience</label>
                  <input style={{ ...fieldInp, maxWidth: 200 }} type="number" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} placeholder="e.g. 3"/>
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom: 10 }}>
                    Required Credentials
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(() => {
                const all = [
                    ...CREDENTIAL_OPTIONS,
                    ...credentials.filter((c) => !CREDENTIAL_OPTIONS.includes(c)),
                ];
                const seen = new Set<string>();
                const unique = all.filter((c) => {
                    const k = c.trim();
                    if (!k)
                        return false;
                    if (seen.has(k))
                        return false;
                    seen.add(k);
                    return true;
                });
                return sortStringsLocale(unique);
            })().map((c) => {
                const on = credentials.includes(c);
                return (<span key={c} onClick={() => toggle(c)} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 12px',
                        borderRadius: 20,
                        cursor: 'pointer',
                        fontSize: 13,
                        userSelect: 'none',
                        background: on ? '#EEF0FB' : '#fff',
                        border: `1px solid ${on ? '#3B4FD8' : '#D0D5DD'}`,
                        color: on ? '#1C32D2' : '#374151',
                    }}>
                          {c}
                          {on && (<span onClick={(e) => {
                            e.stopPropagation();
                            toggle(c);
                        }} style={{
                            fontSize: 14,
                            color: '#1C32D2',
                            lineHeight: 1,
                            marginLeft: 2,
                        }}>
                              ×
                            </span>)}
                        </span>);
            })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <input type="text" value={customCredential} onChange={(e) => setCustomCredential(e.target.value)} onKeyDown={(e) => {
                if (e.key !== 'Enter')
                    return;
                e.preventDefault();
                addCustomCredential(customCredential);
            }} placeholder="Add custom credential and press Enter" style={{ ...fieldInp, flex: 1 }}/>
                    <button type="button" onClick={() => addCustomCredential(customCredential)} disabled={!customCredential.trim()} style={{
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid #D0D5DD',
                background: customCredential.trim() ? '#fff' : '#F3F4F6',
                color: customCredential.trim() ? '#111827' : '#9CA3AF',
                fontSize: 13,
                fontWeight: 600,
                cursor: customCredential.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
            }}>
                      Add
                    </button>
                  </div>
                </div>
                <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: '#374151',
                cursor: 'pointer',
            }}>
                  <input type="checkbox" checked={travelReq} onChange={(e) => setTravelReq(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1C32D2' }}/>
                  Locum is required to travel to Clinic
                </label>
                {submitError && (<p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>
                    {submitError}
                  </p>)}
              </div>
            </div>) : (<CollapsedStep icon={<RequirementsIcon />} label="Requirements" sub="List mandatory licenses and experience" onClick={() => setStep(3)}/>)}
        </div>

        
        <div style={{
            padding: '16px 24px',
            borderTop: '1px solid #F3F4F6',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
        }}>
          {step < 3 ? (<button onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)} style={{
                padding: '10px 28px',
                background: '#fff',
                border: '1px solid #D0D5DD',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                color: '#0B0F1F',
                cursor: 'pointer',
            }}>
              Next
            </button>) : (<button onClick={handleDone} disabled={submitting} style={{
                padding: '10px 28px',
                background: submitting ? '#9CA3AF' : '#1C32D2',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                color: '#fff',
                cursor: submitting ? 'default' : 'pointer',
            }}>
              {submitting ? 'Posting…' : 'Done'}
            </button>)}
        </div>
      </div>

      {saveDraftPromptOpen ? (<>
          <div onClick={() => setSaveDraftPromptOpen(false)} style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                zIndex: 210,
            }}/>
          <div role="dialog" aria-modal="true" aria-labelledby="save-draft-prompt-title" style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: '#fff',
                borderRadius: 12,
                padding: '24px 28px',
                width: 'min(400px, calc(100vw - 32px))',
                zIndex: 211,
                boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                fontFamily: 'Inter, sans-serif',
            }}>
            <h2 id="save-draft-prompt-title" style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#0B0F1F',
                margin: '0 0 8px',
            }}>
              Save as draft?
            </h2>
            <p style={{
                fontSize: 14,
                color: '#6B7280',
                margin: '0 0 20px',
                lineHeight: 1.5,
            }}>
              You have unsaved changes. Save this job as a draft? It will appear under Draft Locum Shifts.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button type="button" onClick={() => void confirmSaveDraft()} disabled={savingDraft} style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: savingDraft ? '#9CA3AF' : '#1C32D2',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: savingDraft ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                }}>
                {savingDraft ? 'Saving…' : 'Save as draft'}
              </button>
              <button type="button" onClick={discardWithoutSave} disabled={savingDraft} style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px solid #D0D5DD',
                    background: '#fff',
                    color: '#374151',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: savingDraft ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                }}>
                Don&apos;t save
              </button>
              <button type="button" onClick={() => setSaveDraftPromptOpen(false)} disabled={savingDraft} style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: '#6B7280',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: savingDraft ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                }}>
                Keep editing
              </button>
            </div>
          </div>
        </>) : null}
    </>);
}
export default function HostDashboard(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { profileComplete, completeProfile, isLoading: authLoading, userId } = useAuth();
    const [profileGateResolved, setProfileGateResolved] = useState(false);
    const [mounted, setMounted] = useState(false);
    const openedFromQueryRef = useRef(false);
    const [activeTab, setActiveTab] = useState<'active' | 'ongoing' | 'recent' | 'draft' | 'deleted'>('active');
    const [showJobOverlay, setShowJobOverlay] = useState(false);
    const [jobPostConfirmation, setJobPostConfirmation] = useState<null | 'posted' | 'draft'>(null);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [deletedJobs, setDeletedJobs] = useState<Job[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [dataLoadError, setDataLoadError] = useState<string | null>(null);
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [jobApplications, setJobApplications] = useState<Record<string, ApplicationRecord[]>>({});
    const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
    const [loadingAppsFor, setLoadingAppsFor] = useState<string | null>(null);
    const [reopenTarget, setReopenTarget] = useState<Job | null>(null);
    const [profile, setProfile] = useState<HostProfile | null>(null);
    const [initialDashboardLoad, setInitialDashboardLoad] = useState(true);
    const hostFirst = profile?.contactFirstName ?? '';
    const hostLast = profile?.contactLastName ?? '';
    const verified = isCpsnsVerificationApproved(profile?.cpsnsVerificationStatus);
    const doctorLabel = hostFirst || hostLast ? `Dr ${hostFirst} ${hostLast}`.trim() : 'Doctor';
    const clinicName = profile?.clinicName || 'Welcome';
    const profilePct = hostProfileCompletionPct(profile);
    const profileStatusCard = getHostProfileStatusCard(profile, profilePct);
    const loadDashboardFromApi = useCallback(async (options?: {
        silent?: boolean;
    }) => {
        if (!options?.silent)
            setLoadingData(true);
        setDataLoadError(null);
        try {
            const errs: string[] = [];
            const [profileResult, jobsResult, deletedJobsResult, statsResult] = await Promise.allSettled([
                hostApi.getProfile(),
                fetchAllPaginated((cursor) => hostApi.getJobs({ cursor, limit: 100 })),
                fetchAllPaginated((cursor) => hostApi.getJobs({ deleted: true, cursor, limit: 100 })),
                hostApi.getDashboardStats(),
            ]);
            if (profileResult.status === 'fulfilled') {
                setProfile(profileResult.value);
            }
            else {
                setProfile(null);
                const pr = profileResult.reason;
                if (pr instanceof ApiHttpError && pr.status === 401) {
                    errs.push('Could not verify your session for this page. If the API was starting, try Refresh. Otherwise sign in again.');
                }
                else {
                    errs.push(pr instanceof Error ? pr.message : 'Could not load profile.');
                }
            }
            if (jobsResult.status === 'fulfilled') {
                setJobs(jobsResult.value);
            }
            else {
                const r = jobsResult.reason;
                if (r instanceof ApiHttpError && r.status === 401) {
                    errs.push('Could not load jobs (unauthorized or API unavailable).');
                }
                else {
                    errs.push(r instanceof Error ? r.message : 'Could not load jobs.');
                }
                setJobs([]);
            }
            if (deletedJobsResult.status === 'fulfilled') {
                setDeletedJobs(deletedJobsResult.value);
            }
            else {
                setDeletedJobs([]);
            }
            if (statsResult.status === 'fulfilled') {
                setDashStats(statsResult.value);
            }
            if (errs.length)
                setDataLoadError([...new Set(errs)].join(' '));
        }
        finally {
            setLoadingData(false);
            setInitialDashboardLoad(false);
        }
    }, []);
    useEffect(() => {
        setMounted(true);
    }, []);
    useEffect(() => {
        if (!mounted) return;
        if (openedFromQueryRef.current) return;
        if (searchParams?.get('postJob') !== '1') return;
        openedFromQueryRef.current = true;
        setShowJobOverlay(true);
        // Clean URL without adding history
        beforeClientNavigation('/host/dashboard');
        router.replace('/host/dashboard');
    }, [mounted, searchParams, router]);
    useEffect(() => {
        if (!mounted || authLoading)
            return;
        if (profileComplete) {
            setProfileGateResolved(true);
            return;
        }
        let cancelled = false;
        void (async () => {
            const synced = await ensureProfileMarkedCompleteFromServer();
            if (cancelled)
                return;
            if (synced) {
                completeProfile();
                setProfileGateResolved(true);
                return;
            }
            beforeClientNavigation('/host/setup');
            router.replace('/host/setup');
        })();
        return () => {
            cancelled = true;
        };
    }, [mounted, profileComplete, authLoading, router, completeProfile]);
    useEffect(() => {
        if (!mounted || authLoading)
            return;
        if (!getToken()) {
            setProfile(null);
            setInitialDashboardLoad(false);
            beforeClientNavigation('/auth');
            router.replace('/auth');
            return;
        }
        void loadDashboardFromApi();
    }, [mounted, authLoading, userId, loadDashboardFromApi, router]);
    useEffect(() => {
        if (!jobPostConfirmation)
            return;
        const t = window.setTimeout(() => setJobPostConfirmation(null), 12000);
        return () => window.clearTimeout(t);
    }, [jobPostConfirmation]);
    const today = new Date();
    const jobStatus = (j: Job) => String(j.status ?? '').toUpperCase();
    const draftJobs = jobs.filter((j) => jobStatus(j) === 'DRAFT');
    const activePosts = jobs.filter((j) => jobStatus(j) === 'ACTIVE');
    const ongoingJobs = jobs.filter((j) => isConfirmedLocumShift(j));
    const recentJobs = jobs.filter((j) => isCompletedLocumShift(j));
    const tabJobs = activeTab === 'deleted'
        ? deletedJobs
        : activeTab === 'active'
            ? activePosts
            : activeTab === 'ongoing'
                ? ongoingJobs
                : activeTab === 'recent'
                    ? recentJobs
                    : draftJobs;
    const totalLocumShiftsPosted = dashStats?.totalJobsPosted ?? jobs.filter((j) => jobStatus(j) !== 'DRAFT').length;
    const statsDisplay = [
        {
            label: 'Total Locum Shifts Posted',
            value: totalLocumShiftsPosted,
        },
        {
            label: 'Total Locum Shifts Completed',
            value: recentJobs.length,
        },
    ];
    async function handleToggleApplicants(jobId: string) {
        if (expandedJobId === jobId) {
            setExpandedJobId(null);
            return;
        }
        setExpandedJobId(jobId);
        setLoadingAppsFor(jobId);
        try {
            const result = await fetchAllPaginated((cursor) =>
                hostApi.getApplications(jobId, { cursor, limit: 100 }),
            );
            setJobApplications((prev) => ({
                ...prev,
                [jobId]: result,
            }));
        }
        finally {
            setLoadingAppsFor(null);
        }
    }
    async function handleReopen(payload: {
        additionalApplicants: number;
        startDate: string;
        endDate: string;
    }) {
        if (!reopenTarget)
            return;
        await hostApi.reopenJob(reopenTarget.id, payload);
        setReopenTarget(null);
        void loadDashboardFromApi({ silent: true });
    }
    const showShellLoading = !mounted || authLoading || !profileGateResolved || initialDashboardLoad;
    return (<DashLayout
            navItems={HOST_DASH_NAV}
            activeHref={pathname ?? '/host/dashboard'}
            topbarFirstName={profile?.contactFirstName ?? undefined}
            topbarLastName={profile?.contactLastName ?? undefined}
        >
          {showShellLoading ? (<div style={{
                minHeight: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter, sans-serif',
                color: '#64748b',
                fontSize: 14,
            }}>
        Loading dashboard…
      </div>) : (<><div className="host-dash-page dash-page-shell" style={{
            maxWidth: 1180,
            width: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            boxSizing: 'border-box',
        }}>
          
            {jobPostConfirmation && (<div className="host-dash-confirmation-alert" role="status" aria-live="polite" style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '16px 18px',
                    borderRadius: 10,
                    background: jobPostConfirmation === 'draft' ? '#FFFBEB' : '#ECFDF5',
                    border: jobPostConfirmation === 'draft'
                        ? '1px solid #FDE68A'
                        : '1px solid #A7F3D0',
                    boxShadow: jobPostConfirmation === 'draft'
                        ? '0 4px 14px rgba(245, 158, 11, 0.12)'
                        : '0 4px 14px rgba(16, 185, 129, 0.12)',
                }}>
              <div style={{
                        flexShrink: 0,
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: jobPostConfirmation === 'draft' ? '#FEF3C7' : '#D1FAE5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        lineHeight: 1,
                        color: jobPostConfirmation === 'draft' ? '#92400E' : '#047857',
                    }} aria-hidden>
                ✓
              </div>
              <div style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 700,
                        fontSize: 'var(--font-heading)',
                        color: jobPostConfirmation === 'draft' ? '#92400E' : '#065F46',
                        lineHeight: 1.35,
                    }}>
                {jobPostConfirmation === 'draft'
                    ? 'Shift is saved under "Draft Locum Shifts". Please post again after profile is verified. Thanks.'
                    : 'You have posted your locum shifts successfully.'}
              </div>
              <button type="button" onClick={() => setJobPostConfirmation(null)} aria-label="Dismiss confirmation" style={{
                        flexShrink: 0,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        fontSize: 22,
                        lineHeight: 1,
                        color: jobPostConfirmation === 'draft' ? '#92400E' : '#065F46',
                        opacity: 0.75,
                    }}>
              ×
            </button>
            </div>)}

            <div className="host-dash-top-section" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div className="host-dash-header-row" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="host-dash-header-info" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, flex: 1 }}>
                <div className="host-dash-header-badge" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            width: 'fit-content',
            maxWidth: '100%',
            padding: 0,
            background: 'rgba(171,230,234,0.1)',
            borderRadius: 50,
        }}>
                  <span style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-heading)',
            lineHeight: '120%',
            color: '#309BB7',
            textTransform: 'capitalize',
        }}>
                    <NameWithVerifiedShield
                      verified={verified}
                      shieldSize={20}
                      shieldStroke="#309BB7"
                      gap={6}
                    >
                      <span>{doctorLabel}</span>
                    </NameWithVerifiedShield>
                  </span>
                </div>
                <h1 style={{
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-heading)',
            lineHeight: '120%',
            color: '#0B0F1F',
            textTransform: 'capitalize',
        }}>
                  {clinicName}
                </h1>
              </div>
              <button type="button" className="host-dash-post-btn" onClick={() => { setShowJobOverlay(true); }} style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '10px 12px',
                background: 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
                borderRadius: 8,
                flexShrink: 0,
              }}>
                <PlusIcon />
                <span style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 'var(--font-weight-bold)',
                  fontSize: 'var(--font-body)',
                  lineHeight: '140%',
                  color: '#fff',
                  whiteSpace: 'nowrap',
                }}>
                  Post New Job
                </span>
              </button>
              </div>

              {dataLoadError && (<div role="alert" style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                fontFamily: 'Inter, sans-serif',
                fontSize: 'var(--font-body)',
                color: '#991B1B',
                lineHeight: 1.45,
            }}>
                  {dataLoadError}
                </div>)}

              <div className="host-dash-profile-banner" style={{
            background: 'rgba(209,213,219,0.3)',
            borderRadius: 10,
            padding: '0 27px',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
        }}>
              <div className="host-dash-profile-banner-content" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <ProfileStatusGlyph
                  className="host-dash-profile-banner-glyph"
                  variant={profileStatusCard.glyphVariant}
                  size={52}
                />
                <div className="host-dash-profile-banner-text" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
                  <span className="host-dash-profile-banner-title" style={{
            fontFamily: 'Gilroy-Medium, Inter, sans-serif',
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-heading)',
            lineHeight: '120%',
            color: '#151414',
        }}>
                    {profileStatusCard.title}
                  </span>
                  <span className="host-dash-profile-banner-subtitle" style={{
            fontFamily: 'Gilroy-Medium, Inter, sans-serif',
            fontWeight: 'var(--font-weight-normal)',
            fontSize: 'var(--font-body)',
            lineHeight: '140%',
            color: '#606061',
            whiteSpace: 'normal',
            maxWidth: 520,
        }}>
                    {(() => {
                      const variant = profileStatusCard.glyphVariant;
                      const isUnderVerification = variant === 'underReview';
                      const isVerified = variant === 'verified';
                      if (!isUnderVerification && !isVerified) return profileStatusCard.subtitle;

                      const badge = getHostVerificationStatusBadge(profile);
                      return (
                        <>
                          {profilePct}% completed · {badge ? <VerificationStatusPill {...badge} /> : null}
                        </>
                      );
                    })()}
                  </span>
                </div>
              </div>
              <button type="button" className="host-dash-profile-banner-btn" onClick={() => {
            beforeClientNavigation('/host/profile');
            router.push('/host/profile');
        }} style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 12px',
            background: '#fff',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            flexShrink: 0,
        }}>
                <UserEditIcon />
                <span style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-body)',
            lineHeight: '140%',
            color: '#0B0F1F',
        }}>
                  Edit Profile
                </span>
              </button>
            </div>

              <div className="host-dash-stats-card" style={{
            display: 'flex',
            border: '1px solid #e2e5ee',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
            flexShrink: 0,
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
        }}>
                {statsDisplay.map((stat, i) => (
                  <div
                    key={stat.label}
                    className="host-dash-stats-cell"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '18px 18px',
                      borderRight: i < statsDisplay.length - 1 ? '1px solid #e2e5ee' : undefined,
                    }}
                  >
                    <p style={{
                      margin: 0,
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 'var(--font-weight-bold)',
                      fontSize: 'var(--font-heading)',
                      lineHeight: '140%',
                      color: '#4A4A4A',
                      wordBreak: 'break-word',
                    }}>
                      {stat.label} :{' '}
                      <span style={{ color: '#000' }}>{loadingData ? '–' : stat.value}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="host-dash-jobs-section" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="host-dash-tabs-row">
                <div className="host-dash-tabs-scroll">
                  {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (<button
                    key={tab.id}
                    type="button"
                    className={`host-dash-tab-btn${isActive ? ' host-dash-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                >
                        <span className="host-dash-tab-label">
                          {tab.label}
                        </span>
                      </button>);
        })}
                </div>
              </div>

              
              <div className="host-dash-job-list" style={{
            marginTop: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
        }}>
                {loadingData && (<div style={{
                padding: '40px',
                textAlign: 'center',
                fontSize: 'var(--font-body)',
                color: '#9CA3AF',
            }}>
                    Loading…
                  </div>)}

                {!loadingData && tabJobs.length === 0 && (<div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 80,
                gap: 12,
            }}>
                    <EmptyIllustration />
                    <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'var(--font-weight-bold)',
                fontSize: 'var(--font-heading)',
                color: '#0B0F1F',
                marginTop: 8,
            }}>
                      {activeTab === 'deleted'
                        ? 'No deleted locum shifts'
                        : activeTab === 'draft'
                            ? 'No drafts yet'
                            : 'No locum shifts yet'}
                    </span>
                    <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'var(--font-weight-normal)',
                fontSize: 'var(--font-body)',
                color: '#6B7280',
            }}>
                      {activeTab === 'active' &&
                'You have not posted any locum shifts yet'}
                      {activeTab === 'ongoing' &&
                'No confirmed locum shifts yet'}
                      {activeTab === 'recent' && 'No completed locum shifts'}
                      {activeTab === 'draft' && 'No draft locum shifts saved'}
                      {activeTab === 'deleted' &&
                'Locum shifts you delete from the dashboard appear here'}
                    </span>
                    {activeTab === 'draft' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!verified) {
                            window.alert('Shift is saved under "Draft Locum Shifts". Please post again after profile is verified. Thanks.');
                            return;
                          }
                          setShowJobOverlay(true);
                        }}
                        style={{
                          marginTop: 8,
                          padding: '10px 24px',
                          background: verified ? 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)' : '#9CA3AF',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                        Post Job
                      </button>
                    )}
                  </div>)}

                {!loadingData &&
            tabJobs.map((job) => (<JobCard key={job.id} job={job} expandedJobId={expandedJobId} applications={jobApplications} loadingAppsFor={loadingAppsFor} onToggleApplicants={handleToggleApplicants} onViewAll={(jobId) => {
                    const href = `/host/applicants/${jobId}`;
                    beforeClientNavigation(href);
                    router.push(href);
                }} onReOpen={(j) => setReopenTarget(j)} onEdit={(j) => {
                    const href = `/host/jobs/${j.id}/edit`;
                    beforeClientNavigation(href);
                    router.push(href);
                }} onPublish={async (j) => {
                    if (!verified) {
                      window.alert('Shift is saved under "Draft Locum Shifts". Please post again after profile is verified. Thanks.');
                      return;
                    }
                    try {
                      await hostApi.updateJob(j.id, { status: 'ACTIVE' });
                      void loadDashboardFromApi({ silent: true });
                      setActiveTab('active');
                    } catch (e) {
                      window.alert(e instanceof Error ? e.message : 'Could not post job.');
                    }
                }} onJobDeleted={loadDashboardFromApi}/>))}
              </div>
            </div>
          </div>

      
      {showJobOverlay && (<JobPostingOverlay verified={verified} onClose={() => setShowJobOverlay(false)} onDraftSaved={async (savedJob) => {
                const draftJob: Job = { ...savedJob, status: 'DRAFT' };
                setJobs((prev) => [draftJob, ...prev.filter((j) => j.id !== draftJob.id)]);
                setActiveTab('draft');
                try {
                    const fromApi = await fetchAllPaginated((cursor) =>
                        hostApi.getJobs({ cursor, limit: 100 }),
                    );
                    setJobs(fromApi.map((j) => j.id === draftJob.id ? { ...j, status: 'DRAFT' } : j));
                }
                catch {
                    /* keep optimistic draft row */
                }
            }} onSuccess={(createdJob) => {
                const job = normalizeHostJob(createdJob);
                setShowJobOverlay(false);
                setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
                const tab = dashboardTabForJob(job);
                setJobPostConfirmation(tab === 'draft' ? 'draft' : 'posted');
                setActiveTab(tab);
                void loadDashboardFromApi({ silent: true });
            }}/>)}

      
      {reopenTarget && (<ReOpenModal key={reopenTarget.id} job={reopenTarget} onConfirm={handleReopen} onCancel={() => setReopenTarget(null)}/>)}
      </>)}
    </DashLayout>);
}
