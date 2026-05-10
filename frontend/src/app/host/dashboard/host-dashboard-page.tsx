'use client';
import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { getToken } from '@/lib/auth';
import { useAuth } from '@/providers/AuthProvider';
import { hostProfileCompletionPct } from '@/lib/hostProfileCompletion';
import { computeAvatarInitials } from '@/lib/avatarInitials';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { isCpsnsVerified } from '@/lib/cpsnsVerify';
import { ApiHttpError, authApi, hostApi, uploadFile, type Job, type ApplicationRecord, type CreateJobPayload, } from '@/lib/api';
import { beforeClientNavigation } from '@/lib/topLoader';
import type { HostProfile } from '@/types';
import { BellIcon, BookIcon, EmptyIllustration, FileIcon, MessageIcon, PlusIcon, ProfileIcon, ReopenJobIcon, ShieldIcon, TrashIcon, UserEditIcon, } from './host-dashboard-icons';
const NAV_ITEMS = [
    { id: 'postings', label: 'My Postings', href: '/host/dashboard' },
    { id: 'profile', label: 'Profile', href: '/host/profile' },
    { id: 'messages', label: 'Messages', href: '/host/messages' },
    { id: 'resources', label: 'Resources', href: '/host/resources' },
];
const TABS = [
    { id: 'active', label: 'Active Posts' },
    { id: 'ongoing', label: 'Ongoing Jobs' },
    { id: 'recent', label: 'Completed Jobs' },
    { id: 'draft', label: 'Draft Jobs' },
];
const NAVBAR_HEIGHT = 76;
const CREDENTIAL_OPTIONS = [
    'CPSNS Full License',
    'CFPC Eligible',
    'CMPA coverage',
    'BLS (ACLS preferred)',
    'DEA License',
    'PALS Certified',
];
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
    if (!iso)
        return '';
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    });
}
function isoToDateInputLocal(iso: string | null | undefined): string {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function isJobPastEndDate(job: Pick<Job, 'endDate'>): boolean {
    if (!job.endDate)
        return false;
    const end = new Date(job.endDate);
    if (Number.isNaN(end.getTime()))
        return false;
    return end < new Date();
}
function parseMmDdYyyyToIso(input: string): string {
    const t = input.trim();
    if (!t)
        return '';
    const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!m)
        return '';
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yyyy = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100)
        return '';
    const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const d = new Date(`${iso}T12:00:00`);
    return d.getFullYear() === yyyy && d.getMonth() + 1 === mm && d.getDate() === dd
        ? iso
        : '';
}
function getLocumDisplayName(app: ApplicationRecord): string {
    const { firstName, lastName, user } = app.locumProfile;
    if (firstName || lastName)
        return `Dr ${firstName ?? ''} ${lastName ?? ''}`.trim();
    return user.email.split('@')[0];
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
        const st = new Date(`${startDate}T12:00:00`);
        const en = new Date(`${endDate}T12:00:00`);
        if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) {
            window.alert('Invalid dates.');
            return;
        }
        if (en < st) {
            window.alert('End date must be on or after the start date.');
            return;
        }
        const n = Number(extra);
        const additionalApplicants = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
        setBusy(true);
        try {
            await onConfirm({
                additionalApplicants,
                startDate: startDate.trim(),
                endDate: endDate.trim(),
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
      <div style={{
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
            background: 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
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
                const isShortlisted = app.status === 'SHORTLISTED' || app.status === 'CONFIRMED';
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
                        background: isShortlisted ? '#22C55E' : '#D1D5DB',
                        flexShrink: 0,
                    }}/>
                <span style={{
                        fontSize: 'var(--font-body)',
                        color: isShortlisted ? '#166534' : '#6B7280',
                    }}>
                  {isShortlisted ? 'Shortlisted' : 'Pending'}
                </span>
              </div>
              <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        background: (app as any).locumResponse === 'ACCEPTED' ? '#D1FAE5' : (app as any).locumResponse === 'REJECTED' ? '#FEE2E2' : '#F3F4F6',
                        color: (app as any).locumResponse === 'ACCEPTED' ? '#065F46' : (app as any).locumResponse === 'REJECTED' ? '#991B1B' : '#6B7280',
                    }}>
                {(app as any).locumResponse === 'ACCEPTED' ? 'Accepted' : (app as any).locumResponse === 'REJECTED' ? 'Rejected' : '—'}
              </span>
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
function JobCard({ job, expandedJobId, applications, loadingAppsFor, onToggleApplicants, onViewAll, onReOpen, onEdit, onJobDeleted, }: {
    job: Job;
    expandedJobId: string | null;
    applications: Record<string, ApplicationRecord[]>;
    loadingAppsFor: string | null;
    onToggleApplicants: (jobId: string) => void;
    onViewAll: (jobId: string) => void;
    onReOpen: (job: Job) => void;
    onEdit: (job: Job) => void;
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
    const isExpanded = expandedJobId === job.id;
    const isFilled = job.status === 'ONGOING';
    const isDraft = job.status === 'DRAFT';
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
    const showExpiredActiveCard = job.status === 'ACTIVE' && isJobPastEndDate(job);
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
    return (<div style={{
            border: showExpiredActiveCard ? '1px solid #D1D5DB' : '1px solid #E5E7EB',
            borderRadius: 10,
            background: showExpiredActiveCard ? '#F3F4F6' : '#fff',
            padding: '18px 20px',
            boxSizing: 'border-box',
            opacity: showExpiredActiveCard ? 0.92 : 1,
        }}>
      <div style={{
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
            color: showExpiredActiveCard ? '#6B7280' : '#0B0F1F',
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
                color: showExpiredActiveCard ? '#9CA3AF' : '#6B7280',
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
                <span style={{ fontSize: 'var(--font-body)', color: showExpiredActiveCard ? '#78716C' : '#374151' }}>
                  {startFmt}
                  {startFmt && endFmt && ' – '}
                  {endFmt}
                </span>
              </div>)}
            {pay && (<span style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-heading)', color: showExpiredActiveCard ? '#78716C' : '#0B0F1F' }}>
                {pay}
              </span>)}
          </div>
        </div>

        
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            flexShrink: 0,
            gap: !isDraft && !isFilled ? 18 : 10,
            minWidth: 120,
        }}>
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
                    : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                border: 'none',
                borderRadius: 6,
                color: isExpanded ? '#1C32D2' : '#fff',
                fontWeight: 'var(--font-weight-bold)',
                fontSize: 'var(--font-small)',
                cursor: 'pointer',
            }}>
              {appCount} Applicant{appCount !== 1 ? 's' : ''}
            </button>)}
        </div>
      </div>

      
      {isExpanded && !isDraft && (<InlineApplicantsTable jobId={job.id} jobTitle={job.title} applications={applications[job.id] ?? []} loading={loadingAppsFor === job.id} onViewAll={() => onViewAll(job.id)}/>)}
    </div>);
}
function JobPostingOverlay({ onClose, onSuccess, verified = false, }: {
    onClose: () => void;
    onSuccess: () => void;
    verified?: boolean;
}) {
    const [step, setStep] = useState(1);
    const [jobTitle, setJobTitle] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [keyResponsibilities, setKeyResponsibilities] = useState('');
    const [startDateInput, setStartDateInput] = useState('');
    const [endDateInput, setEndDateInput] = useState('');
    const [startTime, setStartTime] = useState('05:00');
    const [endTime, setEndTime] = useState('14:00');
    const [flexible, setFlexible] = useState(false);
    const [ratePerDay, setRatePerDay] = useState('');
    const [yearsExp, setYearsExp] = useState('');
    const [credentials, setCredentials] = useState<string[]>([
        'CPSNS Full License',
    ]);
    const [customCredential, setCustomCredential] = useState('');
    const [travelReq, setTravelReq] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
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
        if (new Date(endIso) < new Date(startIso)) {
            setSubmitError('End date must be on or after start date.');
            return;
        }
        if (!startTime) {
            setSubmitError('Start time is required.');
            return;
        }
        if (!endTime) {
            setSubmitError('End time is required.');
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
                keyResponsibilities: keyResponsibilities
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                startDate: startIso || undefined,
                endDate: endIso || undefined,
                startTime: startTime || undefined,
                endTime: endTime || undefined,
                payPerDay: rateNum,
                minYearsExperience: yearsExp.trim() && Number.isFinite(yearsNum) ? yearsNum : undefined,
                requiredCredentials: credentials,
                travelRequired: travelReq,
                scheduleFlexible: flexible,
            };
            await hostApi.createJob(payload);
            onSuccess();
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
            padding: '10px 20px',
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            color: '#92400E',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          ⚠️  CPSNS is not  verified — this job will be saved as a Draft.
        </div>)}
      <div onClick={onClose} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,50,130,0.45)',
            zIndex: 200,
        }}/>
      <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 480,
            height: '100vh',
            background: '#fff',
            zIndex: 201,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, sans-serif',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}>
        
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
          <button onClick={onClose} style={{
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

        
        <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
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
                <div>
                  <label style={lbl}>Job Title *</label>
                  <input style={fieldInp} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job Title"/>
                </div>
                <div>
                  <label style={lbl}>Job Description</label>
                  <textarea style={{
                ...fieldInp,
                height: 90,
                resize: 'none',
            } as React.CSSProperties} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Describe the role…"/>
                </div>
                <div>
                  <label style={lbl}>Key Responsibilities (one per line)</label>
                  <textarea style={{
                ...fieldInp,
                height: 80,
                resize: 'none',
            } as React.CSSProperties} value={keyResponsibilities} onChange={(e) => setKeyResponsibilities(e.target.value)} placeholder="List key responsibilities…"/>
                </div>
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
                <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
            }}>
                  <div>
                    <label style={lbl}>Start Date *</label>
                    <input type="text" inputMode="numeric" autoComplete="off" placeholder="MM-DD-YYYY" pattern="[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}" title="MM-DD-YYYY" style={fieldInp} value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)}/>
                  </div>
                  <div>
                    <label style={lbl}>End Date *</label>
                    <input type="text" inputMode="numeric" autoComplete="off" placeholder="MM-DD-YYYY" pattern="[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}" title="MM-DD-YYYY" style={fieldInp} value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)}/>
                  </div>
                </div>
                <div style={{
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
                <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: '#374151',
                cursor: 'pointer',
            }}>
                  <input type="checkbox" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1C32D2' }}/>
                  Schedule is flexible
                </label>
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
                const selected = unique.filter((c) => credentials.includes(c));
                const rest = unique.filter((c) => !credentials.includes(c));
                return [...selected, ...rest];
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
              {submitting ? 'Publishing…' : 'Done'}
            </button>)}
        </div>
      </div>
    </>);
}
export default function HostDashboard(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
    const router = useRouter();
    const { profileComplete, isLoading: authLoading, userId, logout } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [activeNav, setActiveNav] = useState('postings');
    const [activeTab, setActiveTab] = useState<'active' | 'ongoing' | 'recent' | 'draft'>('active');
    const [showJobOverlay, setShowJobOverlay] = useState(false);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [dataLoadError, setDataLoadError] = useState<string | null>(null);
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [jobApplications, setJobApplications] = useState<Record<string, ApplicationRecord[]>>({});
    const [loadingAppsFor, setLoadingAppsFor] = useState<string | null>(null);
    const [reopenTarget, setReopenTarget] = useState<Job | null>(null);
    const [profile, setProfile] = useState<HostProfile | null>(null);
    const [initialDashboardLoad, setInitialDashboardLoad] = useState(true);
    const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
    const avatarMenuRef = useRef<HTMLDivElement>(null);
    const avatarFileInputRef = useRef<HTMLInputElement>(null);
    const [avatarUploadBusy, setAvatarUploadBusy] = useState(false);
    const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null);
    const hostFirst = profile?.contactFirstName ?? '';
    const hostLast = profile?.contactLastName ?? '';
    const hostInitial = computeAvatarInitials(profile?.contactFirstName, profile?.contactLastName, profile?.clinicName);
    const verified = isCpsnsVerified(profile?.cpsnsNumber);
    const doctorLabel = hostFirst || hostLast ? `Dr ${hostFirst} ${hostLast}`.trim() : 'Doctor';
    const clinicName = profile?.clinicName || 'Welcome';
    const profilePct = hostProfileCompletionPct(profile);
    const profileAllStepsDone = profilePct === 100;
    const dashboardProfileTitle = !profileAllStepsDone
        ? 'Set up your complete profile'
        : verified
            ? 'Profile complete and verified'
            : 'Profile complete — CPSNS under verification';
    const dashboardProfileSubtitle = !profileAllStepsDone
        ? `${profilePct}% Completed`
        : verified
            ? '100% · CPSNS verified'
            : '100% · Awaiting manual CPSNS verification';
    const loadDashboardFromApi = useCallback(async () => {
        setLoadingData(true);
        setDataLoadError(null);
        try {
            const errs: string[] = [];
            const [profileResult, jobsResult] = await Promise.allSettled([
                hostApi.getProfile(),
                hostApi.getJobs(),
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
                setJobs(jobsResult.value.jobs);
            }
            else {
                const r = jobsResult.reason;
                if (r instanceof ApiHttpError && r.status === 401) {
                    errs.push('Could not load jobs (unauthorized or API unavailable).');
                }
                else {
                    errs.push(r instanceof Error ? r.message : 'Could not load jobs.');
                }
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
        if (!mounted)
            return;
        if (!getToken())
            return;
        let cancelled = false;
        void (async () => {
            try {
                const me = await authApi.getMe();
                if (!cancelled)
                    setAvatarPhotoUrl(me.avatarUrl);
            }
            catch {
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mounted, userId]);
    useEffect(() => {
        if (!avatarMenuOpen)
            return;
        function onMouseDown(e: MouseEvent) {
            if (avatarMenuRef.current?.contains(e.target as Node))
                return;
            setAvatarMenuOpen(false);
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape')
                setAvatarMenuOpen(false);
        }
        document.addEventListener('mousedown', onMouseDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [avatarMenuOpen]);
    useEffect(() => {
        if (!mounted || authLoading)
            return;
        if (profileComplete === false) {
            beforeClientNavigation('/host/setup');
            router.replace('/host/setup');
        }
    }, [mounted, profileComplete, authLoading, router]);
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
    function handleLogout() {
        logout();
        beforeClientNavigation('/home');
        router.replace('/home');
    }
    const today = new Date();
    const draftJobs = jobs.filter((j) => j.status === 'DRAFT');
    const activePosts = jobs.filter((j) => j.status === 'ACTIVE' || j.status === 'ONGOING');
    const ongoingJobs = jobs.filter((j) => j.status === 'ONGOING');
    const recentJobs = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CANCELLED' || j.status === 'EXPIRED');
    const tabJobs = activeTab === 'active'
        ? activePosts
        : activeTab === 'ongoing'
            ? ongoingJobs
            : activeTab === 'recent'
                ? recentJobs
                : draftJobs;
    const statsDisplay = [
        {
            label: 'Total Jobs Posted',
            value: activePosts.length,
        },
        {
            label: 'Total Completed Jobs',
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
            const result = await hostApi.getApplications(jobId);
            setJobApplications((prev) => ({
                ...prev,
                [jobId]: result.applications,
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
        loadDashboardFromApi();
    }
    if (!mounted || profileComplete === false || authLoading || initialDashboardLoad) {
        return (<div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter, sans-serif',
                background: '#fff',
                color: '#64748b',
                fontSize: 14,
            }}>
        Loading dashboard…
      </div>);
    }
    return (<div style={{
            height: '100vh',
            maxHeight: '100vh',
            overflow: 'hidden',
            fontFamily: 'Inter, sans-serif',
            background: '#fff',
        }}>
      
      <nav style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: NAVBAR_HEIGHT,
            zIndex: 100,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            background: '#FFFFFF',
            borderBottom: '2px solid rgba(0,0,0,0.1)',
        }}>
        <Link href="/home" style={{ textDecoration: 'none' }}>
          <Logo size="md" />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28 }}>
            <BellIcon />
          </div>
          <div ref={avatarMenuRef} style={{ position: 'relative' }}>
            <input ref={avatarFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file)
                    return;
                if (!getToken())
                    return;
                const maxBytes = 5 * 1024 * 1024;
                if (file.size > maxBytes) {
                    window.alert('Image must be 5 MB or smaller.');
                    return;
                }
                setAvatarUploadBusy(true);
                void (async () => {
                    try {
                        const { path, signedUrl } = await uploadFile(file, 'avatars');
                        await authApi.updateAvatar(path);
                        setAvatarPhotoUrl(signedUrl);
                        setAvatarMenuOpen(false);
                    }
                    catch (err) {
                        window.alert(err instanceof Error
                            ? err.message
                            : 'Could not upload photo.');
                    }
                    finally {
                        setAvatarUploadBusy(false);
                    }
                })();
            }}/>
            <div role="button" tabIndex={0} onClick={() => setAvatarMenuOpen((v) => !v)} onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                    setAvatarMenuOpen((v) => !v);
            }} aria-label="Account menu" aria-expanded={avatarMenuOpen} style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: avatarPhotoUrl ? 'transparent' : 'rgba(58,101,219,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                overflow: 'hidden',
                border: avatarPhotoUrl ? '1px solid rgba(0,0,0,0.06)' : 'none',
            }}>
              {avatarPhotoUrl ? (<img src={avatarPhotoUrl} alt="" width={28} height={28} style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                }}/>) : (<span style={{
                    fontFamily: 'Hanken Grotesk, Inter, sans-serif',
                    fontWeight: 'var(--font-weight-bold)',
                    fontSize: 'var(--font-heading)',
                    color: '#0F2AAE',
                }}>
                  {hostInitial}
                </span>)}
            </div>

            {avatarMenuOpen && (<div role="menu" style={{
                position: 'absolute',
                top: 36,
                right: 0,
                minWidth: 210,
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                padding: 6,
                zIndex: 120,
                overflow: 'hidden',
            }}>
                <button type="button" role="menuitem" disabled={avatarUploadBusy || !getToken()} onClick={() => avatarFileInputRef.current?.click()} style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 10px',
                    cursor: avatarUploadBusy || !getToken() ? 'default' : 'pointer',
                    color: '#0f1523',
                    fontSize: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-bold)',
                    textAlign: 'left',
                    opacity: avatarUploadBusy || !getToken() ? 0.55 : 1,
                    fontFamily: 'inherit',
                }} onMouseOver={(e) => {
                    if (!avatarUploadBusy && getToken())
                        e.currentTarget.style.background = '#F3F4F6';
                }} onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}>
                  {avatarUploadBusy
                        ? 'Uploading…'
                        : avatarPhotoUrl
                            ? 'Change profile picture'
                            : 'Set profile picture'}
                </button>
                <button type="button" role="menuitem" onClick={() => {
                    setAvatarMenuOpen(false);
                    handleLogout();
                }} style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 10px',
                    cursor: 'pointer',
                    color: '#dc2626',
                    fontSize: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-bold)',
                    textAlign: 'left',
                    borderTop: '1px solid #F3F4F6',
                    fontFamily: 'inherit',
                }} onMouseOver={(e) => (e.currentTarget.style.background = '#FEF2F2')} onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}>
                  Logout
                </button>
              </div>)}
          </div>
        </div>
      </nav>

      
      <div style={{
            display: 'flex',
            height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
            marginTop: NAVBAR_HEIGHT,
            overflow: 'hidden',
        }}>
        
        <aside style={{
            position: 'relative',
            flexShrink: 0,
            width: 232,
            height: '100%',
            overflowY: 'auto',
            boxSizing: 'border-box',
            background: '#F4F6FB',
            boxShadow: 'inset 0px 4px 22px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 10px 28px',
            gap: 14,
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 8 + NAV_ITEMS.findIndex((n) => n.id === activeNav) * (44 + 14),
            width: 6,
            height: 44,
            background: 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
            borderRadius: '0px 8px 8px 0px',
            transition: 'top 0.2s ease',
        }}/>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            width: '100%',
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id;
            return (<button key={item.id} onClick={() => {
                    setActiveNav(item.id);
                    beforeClientNavigation(item.href);
                    router.push(item.href);
                }} style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    maxWidth: 212,
                    height: 44,
                    padding: '10px 12px 10px 8px',
                    background: isActive
                        ? 'rgba(130,173,237,0.2)'
                        : 'transparent',
                    borderRadius: isActive ? 4 : 16,
                }}>
                    <span style={{
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}>
                      {item.id === 'postings' && <FileIcon active={isActive}/>}
                      {item.id === 'profile' && (<ProfileIcon active={isActive}/>)}
                      {item.id === 'messages' && (<MessageIcon active={isActive}/>)}
                      {item.id === 'resources' && (<BookIcon active={isActive}/>)}
                    </span>
                    <span style={{
                    fontFamily: 'Gilroy-Medium, Inter, sans-serif',
                    fontWeight: 'var(--font-weight-normal)',
                    fontSize: 'var(--font-heading)',
                    lineHeight: '20px',
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                    ...(isActive
                        ? {
                            background: 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }
                        : { color: 'rgba(2,7,27,0.9)' }),
                }}>
                      {item.label}
                    </span>
                  </button>);
        })}
            </div>
          </div>
          <div style={{ width: '100%', height: 1, background: '#DBE1E8' }}/>
        </aside>

        
        <main style={{
            flex: 1,
            overflowY: 'auto',
            background: '#F7F8FA',
            padding: '19px 24px 48px',
            boxSizing: 'border-box',
        }}>
          <div style={{
            maxWidth: 1180,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
        }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            width: 'fit-content',
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
                    {doctorLabel}
                  </span>
                  {verified && <ShieldIcon />}
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

              
              <div style={{
            background: '#fff',
            border: '1px solid rgba(217,217,217,0.8)',
            borderRadius: 10,
            padding: 24,
            boxSizing: 'border-box',
        }}>
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  {statsDisplay.map((stat, i) => (<div key={stat.label} style={{
                display: 'flex',
                alignItems: 'stretch',
                flex: 1,
            }}>
                      <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                flex: 1,
            }}>
                        <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'var(--font-weight-bold)',
                fontSize: 'var(--font-heading)',
                lineHeight: '140%',
                color: '#4A4A4A',
            }}>
                          {stat.label}
                        </span>
                        <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'var(--font-weight-bold)',
                fontSize: 'var(--font-heading)',
                lineHeight: '26px',
                color: '#000',
            }}>
                          {loadingData ? '–' : stat.value}
                        </span>
                      </div>
                      {i < statsDisplay.length - 1 && (<div style={{
                    width: 1,
                    alignSelf: 'stretch',
                    background: '#D9D9D9',
                    marginLeft: 12,
                    marginRight: 12,
                }}/>)}
                    </div>))}
                </div>
              </div>
            </div>

            
            <div style={{
            background: 'rgba(209,213,219,0.3)',
            borderRadius: 10,
            height: 104,
            padding: '0 27px',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
        }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(15,42,175,0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M8 4h12l4 4v16H4V4h4Z" stroke="#803BDB" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M9 12h10M9 16h6" stroke="#803BDB" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="20" cy="20" r="5" fill="#72BC7A" stroke="#72BC7A" strokeWidth="1"/>
                    <path d="M17.5 20l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{
            fontFamily: 'Gilroy-Medium, Inter, sans-serif',
            fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--font-heading)',
            lineHeight: '100%',
            color: '#151414',
        }}>
                    {dashboardProfileTitle}
                  </span>
                  <span style={{
            fontFamily: 'Gilroy-Medium, Inter, sans-serif',
            fontWeight: 'var(--font-weight-normal)',
            fontSize: 'var(--font-body)',
            lineHeight: '100%',
            color: '#606061',
        }}>
                    {dashboardProfileSubtitle}
                  </span>
                </div>
              </div>
              <button onClick={() => {
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
            width: 150,
            height: 41,
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

            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 52,
        }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (<button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 12,
                    height: 52,
                    borderBottom: isActive
                        ? '2px solid #000'
                        : '2px solid transparent',
                }}>
                        <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 'var(--font-weight-bold)',
                    fontSize: 'var(--font-heading)',
                    lineHeight: '24px',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    color: isActive ? '#000' : '#636364',
                    whiteSpace: 'nowrap',
                }}>
                          {tab.label}
                        </span>
                      </button>);
        })}
                </div>
                <button onClick={() => {
            setShowJobOverlay(true);
        }} style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 12px',
            height: 45,
            width: 172,
            background: 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
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
              <div style={{ width: 428, height: 1, background: '#A7A8AA' }}/>

              
              <div style={{
            marginTop: 16,
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
                      {activeTab === 'draft' ? 'No drafts yet' : 'No posts yet'}
                    </span>
                    <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'var(--font-weight-normal)',
                fontSize: 'var(--font-body)',
                color: '#6B7280',
            }}>
                      {activeTab === 'active' &&
                'You have not posted any jobs yet'}
                      {activeTab === 'ongoing' &&
                'No jobs are currently ongoing'}
                      {activeTab === 'recent' && 'No completed jobs'}
                      {activeTab === 'draft' && 'No draft jobs saved'}
                    </span>
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
                }} onJobDeleted={loadDashboardFromApi}/>))}
              </div>
            </div>
          </div>
        </main>
      </div>

      
      {showJobOverlay && (<JobPostingOverlay verified={verified} onClose={() => setShowJobOverlay(false)} onSuccess={() => {
                setShowJobOverlay(false);
                loadDashboardFromApi();
            }}/>)}

      
      {reopenTarget && (<ReOpenModal key={reopenTarget.id} job={reopenTarget} onConfirm={handleReopen} onCancel={() => setReopenTarget(null)}/>)}
    </div>);
}
