'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { hostApi, messageApi, type ApplicationRecord } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useAuth } from '@/providers/AuthProvider';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { beforeClientNavigation } from '@/lib/topLoader';
import { useHostProfile } from '@/hooks/useHostProfile';
const NAV = [
    {
        label: 'My Postings',
        href: '/host/dashboard',
        icon: <NavIcon name="postings"/>,
    },
    { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile"/> },
    {
        label: 'Messages',
        href: '/host/messages',
        icon: <NavIcon name="messages"/>,
    },
    {
        label: 'Resources',
        href: '/host/resources',
        icon: <NavIcon name="resources"/>,
    },
    {
        label: 'Settings',
        href: '/host/settings',
        icon: <NavIcon name="settings"/>,
    },
] as const;
const QUICK_MESSAGE_PANEL_STORAGE_KEY = 'l2-host-applicants-quick-message-panel-pos';
const QUICK_MESSAGE_PANEL_WIDTH = 384;
const QUICK_MESSAGE_PANEL_MAX_HEIGHT = 280;
const DETAIL_PANEL_STORAGE_KEY = 'l2-host-applicants-detail-panel-width';
const DETAIL_PANEL_MIN = 320;
const DETAIL_PANEL_MAX_CAP = 900;
const DETAIL_PANEL_DEFAULT = 420;

function clampDetailPanelWidth(w: number): number {
    if (typeof window === 'undefined')
        return Math.min(Math.max(w, DETAIL_PANEL_MIN), DETAIL_PANEL_MAX_CAP);
    const maxW = Math.min(DETAIL_PANEL_MAX_CAP, window.innerWidth - 24);
    return Math.min(Math.max(w, DETAIL_PANEL_MIN), maxW);
}
function clampQuickMessagePanelPos(p: {
    left: number;
    top: number;
}): {
    left: number;
    top: number;
} {
    if (typeof window === 'undefined')
        return p;
    const margin = 8;
    const w = Math.min(QUICK_MESSAGE_PANEL_WIDTH, window.innerWidth - margin * 2);
    const maxLeft = Math.max(margin, window.innerWidth - w - margin);
    const maxTop = Math.max(margin, window.innerHeight - QUICK_MESSAGE_PANEL_MAX_HEIGHT - margin);
    return {
        left: Math.min(Math.max(margin, p.left), maxLeft),
        top: Math.min(Math.max(margin, p.top), maxTop),
    };
}
function defaultQuickMessagePanelPos(): {
    left: number;
    top: number;
} {
    if (typeof window === 'undefined')
        return { left: 24, top: 100 };
    const w = Math.min(QUICK_MESSAGE_PANEL_WIDTH, window.innerWidth - 16);
    return clampQuickMessagePanelPos({
        left: window.innerWidth - w - 24,
        top: Math.round(window.innerHeight * 0.18),
    });
}
function hostMessagesHref(partnerId: string, jobPostingId: string | null): string {
    const q = new URLSearchParams({ partnerId });
    if (jobPostingId)
        q.set('jobPostingId', jobPostingId);
    return `/host/messages?${q.toString()}`;
}
const STATUS_COLOR: Record<string, string> = {
    APPLIED: '#3B82F6',
    SHORTLISTED: '#10B981',
    CONFIRMED: '#6366F1',
    REJECTED: '#EF4444',
    WITHDRAWN: '#9CA3AF',
};
const VISIBLE_TAGS = 2;
function displayName(a: ApplicationRecord): string {
    const f = a.locumProfile.firstName?.trim() || '';
    const l = a.locumProfile.lastName?.trim() || '';
    const base = `${f} ${l}`.trim();
    return base || a.locumProfile.user.email || 'Applicant';
}

function statusToUi(status: ApplicationRecord['status']): 'shortlisted' | 'pending' {
    return status === 'SHORTLISTED' || status === 'CONFIRMED' ? 'shortlisted' : 'pending';
}

function statusBadgeLabel(status: ApplicationRecord['status']): string {
    switch (status) {
        case 'APPLIED':
            return 'Pending';
        case 'SHORTLISTED':
            return 'Shortlisted';
        case 'CONFIRMED':
            return 'Confirmed';
        case 'REJECTED':
            return 'Rejected';
        case 'WITHDRAWN':
            return 'Withdrawn';
        default:
            return status;
    }
}

function StatusBadge({ status }: { status: ApplicationRecord['status'] }) {
    const dotColor = STATUS_COLOR[status] ?? '#6B7280';
    const label = statusBadgeLabel(status);
    return (<span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 10px',
            border: '1px solid #D1D5DB',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            color: '#6B7280',
            whiteSpace: 'nowrap',
        }}>
      <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            background: dotColor,
        }}/>
      {label}
    </span>);
}

function MessageIcon({ active }: { active: boolean }) {
    return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={active ? '#1C32D2' : 'rgba(107,114,128,0.5)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}

function ShieldIcon() {
    return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 12.5l1.5 1.5 2.75-3M12 2.5l-8 3v5.1c0 4.65 3.42 9 8 10.1 4.58-1.1 8-5.45 8-10.1V5.5l-8-3Z" stroke="#0B0F1F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}

function CloseIcon() {
    return (<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M1 1l10 10M11 1L1 11" stroke="#210840" strokeWidth="2" strokeLinecap="round"/>
    </svg>);
}

function ChevronRight() {
    return (<svg width="7" height="14" viewBox="0 0 7 14" fill="none" aria-hidden>
      <path d="M1 1l5 6-5 6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}

function CalendarIcon() {
    return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="#1522A6" strokeWidth="1.5"/>
      <path d="M8 3v3M16 3v3M3 10h18" stroke="#1522A6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>);
}

function DocRow({ label, subtitle, url, }: {
    label: string;
    subtitle: string;
    url?: string | null;
}) {
    const hasUrl = !!url && url !== '#';
    const outerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        background: 'linear-gradient(0deg,rgba(255,255,255,0.6),rgba(255,255,255,0.6)),linear-gradient(90deg,#DFE1FD 0%,#EDEBFB 100%)',
        borderRadius: 8,
        textDecoration: 'none',
    };
    const inner = (<div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '14px 16px',
            gap: 12,
            border: '1px solid rgba(107,114,128,0.3)',
            borderRadius: 10,
            boxSizing: 'border-box',
        }}>
          <div style={{
            width: 40,
            height: 40,
            background: 'rgba(115,177,251,0.12)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
            <CalendarIcon />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                fontSize: 16,
                lineHeight: '140%',
                color: '#0B0F1F',
                textTransform: 'capitalize',
            }}>
              {label}
            </span>
            <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                fontSize: 13,
                lineHeight: '150%',
                color: 'rgba(107,114,128,0.8)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
              {subtitle}
            </span>
          </div>
          <ChevronRight />
        </div>);
    if (hasUrl) {
        return (<a href={url} target="_blank" rel="noopener noreferrer" style={outerStyle}>
          {inner}
        </a>);
    }
    return (<button type="button" onClick={() => window.alert('No document uploaded')} style={{
            all: 'unset',
            cursor: 'pointer',
            width: '100%',
        }}>
        <div style={outerStyle}>
          {inner}
        </div>
      </button>);
}

function SpecTag({ label }: { label: string }) {
    return (<span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 12px',
            background: 'rgba(58,101,219,0.07)',
            borderRadius: 8,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: 14,
            lineHeight: '150%',
            color: 'rgba(58,101,219,0.8)',
            textTransform: 'capitalize',
            whiteSpace: 'nowrap',
        }}>
      {label}
    </span>);
}

function buildSpecialityTags(profile: ApplicationRecord['locumProfile']): string[] {
    const specText = String((profile as any).specializationText ?? '');
    const specialty = profile.specialty && profile.specialty !== 'OTHER'
        ? profile.specialty.replace(/_/g, ' ')
        : '';
    const fromSpecText = specText.split(',').map((s) => s.trim()).filter(Boolean);
    const all = fromSpecText.length > 0
        ? fromSpecText
        : specialty
            ? [specialty]
            : [];
    const seen = new Set<string>();
    return all.filter((s) => {
        const k = s.toLowerCase();
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
}

function MessageBtn({ active, onClick }: { active: boolean; onClick?: () => void }) {
    return (<button type="button" disabled={!active} onClick={onClick} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: active ? 'pointer' : 'default',
            opacity: active ? 1 : 0.7,
            fontFamily: 'inherit',
        }}>
      <MessageIcon active={active} />
      <span style={{
            fontSize: 14,
            fontWeight: 500,
            ...(active
                ? {
                    background: 'linear-gradient(270deg, #3A65DB 0%, #1B31D2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }
                : { color: 'rgba(107,114,128,0.5)' }),
        }}>
        Message
      </span>
    </button>);
}

function SpecialityTags({ specialities }: { specialities: string[] }) {
    if (!specialities.length) {
        return (<span style={{ fontSize: 13, color: '#9CA3AF' }}>—</span>);
    }
    const visible = specialities.slice(0, VISIBLE_TAGS);
    const rest = Math.max(0, specialities.length - VISIBLE_TAGS);
    return (<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
      {visible.map((s) => (<span key={s} style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            background: 'rgba(209,213,219,0.3)',
            borderRadius: 40,
            fontSize: 13,
            fontWeight: 500,
            color: '#0B0F1F',
            whiteSpace: 'nowrap',
        }}>
        {s}
      </span>))}
      {rest > 0 && (<span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 34,
            padding: '4px 10px',
            background: 'rgba(209,213,219,0.3)',
            borderRadius: 40,
            fontSize: 13,
            fontWeight: 500,
            color: '#6B7280',
            whiteSpace: 'nowrap',
        }}>
        +{rest}
      </span>)}
    </div>);
}

function docLabel(documentType: string): string {
    const map: Record<string, string> = {
        CPSNS_LICENSE: 'CPSNS License',
        CMPA_CERTIFICATE: 'CMPA Certificate',
        DEA_CERTIFICATE: 'DEA Certificate',
        CV: 'Resume / CV',
        PHOTO_ID: 'Photo ID',
        OTHER: 'Document',
    };
    return map[documentType] ?? documentType.replace(/_/g, ' ');
}

function splitDocs(docs: any[]): { primary: any[]; additional: any[] } {
    const primaryTypes = new Set(['CPSNS_LICENSE', 'CV', 'CMPA_CERTIFICATE', 'DEA_CERTIFICATE']);
    const primary: any[] = [];
    const additional: any[] = [];
    for (const d of Array.isArray(docs) ? docs : []) {
        const t = String(d?.documentType ?? '');
        if (primaryTypes.has(t))
            primary.push(d);
        else
            additional.push(d);
    }
    return { primary, additional };
}
export default function HostApplicantsPage(props: {
    params: Promise<{
        jobId: string;
    }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
    const router = useRouter();
    const { profile: headerProfile } = useHostProfile();
    const { isLoading: authLoading, userId } = useAuth();
    const [jobId, setJobId] = useState<string | null>(null);
    const [apps, setApps] = useState<ApplicationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actioning, setActioning] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<ApplicationRecord | null>(null);
    const [detailPanelWidth, setDetailPanelWidth] = useState(DETAIL_PANEL_DEFAULT);
    const [aboutExpanded, setAboutExpanded] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
    const [composeText, setComposeText] = useState('');
    const [composeSending, setComposeSending] = useState(false);
    const [composeError, setComposeError] = useState<string | null>(null);
    const [composeSent, setComposeSent] = useState(false);
    const [quickPanelPos, setQuickPanelPos] = useState<{
        left: number;
        top: number;
    }>({ left: 24, top: 100 });
    const quickPanelDragRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startLeft: number;
        startTop: number;
    } | null>(null);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(DETAIL_PANEL_STORAGE_KEY);
            if (raw) {
                const w = Number(raw);
                if (Number.isFinite(w))
                    setDetailPanelWidth(clampDetailPanelWidth(w));
            }
        }
        catch {
            /* ignore */
        }
    }, []);
    useEffect(() => {
        function onResize() {
            setDetailPanelWidth((w) => clampDetailPanelWidth(w));
        }
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(QUICK_MESSAGE_PANEL_STORAGE_KEY);
            if (raw) {
                const p = JSON.parse(raw) as {
                    left?: unknown;
                    top?: unknown;
                };
                if (typeof p.left === 'number' && typeof p.top === 'number')
                    setQuickPanelPos(clampQuickMessagePanelPos({ left: p.left, top: p.top }));
                else
                    setQuickPanelPos(defaultQuickMessagePanelPos());
            }
            else {
                setQuickPanelPos(defaultQuickMessagePanelPos());
            }
        }
        catch {
            setQuickPanelPos(defaultQuickMessagePanelPos());
        }
    }, []);
    useEffect(() => {
        function onResize() {
            setQuickPanelPos((prev) => clampQuickMessagePanelPos(prev));
        }
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => {
        let cancelled = false;
        void props.params.then((p) => {
            if (!cancelled)
                setJobId(p.jobId);
        });
        return () => {
            cancelled = true;
        };
    }, [props.params]);
    useEffect(() => {
        if (!jobId || authLoading)
            return;
        if (!getToken()) {
            setApps([]);
            setLoading(false);
            setError('You are not logged in.');
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        hostApi
            .getApplications(jobId)
            .then((res) => {
            if (!cancelled)
                setApps(res.applications ?? []);
        })
            .catch((e) => {
            if (cancelled)
                return;
            setError(e instanceof Error ? e.message : 'Could not load applicants.');
            setApps([]);
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [jobId, authLoading, userId]);
    useEffect(() => {
        setAboutExpanded(false);
        setComposeOpen(false);
        setComposeText('');
        setComposeSending(false);
        setComposeError(null);
        setComposeSent(false);
    }, [selected?.id]);
    const byStatus = useMemo(() => {
        const groups: Record<string, ApplicationRecord[]> = {};
        for (const a of apps) {
            groups[a.status] = groups[a.status] ?? [];
            groups[a.status].push(a);
        }
        return groups;
    }, [apps]);
    async function handleShortlistAndMessage(a: ApplicationRecord) {
        if (!jobId)
            return;
        setActioning((prev) => new Set(prev).add(a.id));
        try {
            await hostApi.updateApplication(jobId, a.id, 'SHORTLISTED');
            setApps((prev) => prev.map((app) => app.id === a.id ? { ...app, status: 'SHORTLISTED' } : app));
            const href = hostMessagesHref(a.locumProfile.userId, jobId);
            beforeClientNavigation(href);
            router.push(href);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not shortlist applicant.');
        }
        finally {
            setActioning((prev) => {
                const next = new Set(prev);
                next.delete(a.id);
                return next;
            });
        }
    }
    async function handleReject(a: ApplicationRecord) {
        if (!jobId)
            return;
        setActioning((prev) => new Set(prev).add(a.id));
        try {
            await hostApi.updateApplication(jobId, a.id, 'REJECTED');
            setApps((prev) => prev.map((app) => app.id === a.id ? { ...app, status: 'REJECTED' } : app));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not reject applicant.');
        }
        finally {
            setActioning((prev) => {
                const next = new Set(prev);
                next.delete(a.id);
                return next;
            });
        }
    }
    function onDetailPanelResizeMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = detailPanelWidth;
        let latestW = startW;
        const onMove = (ev: MouseEvent) => {
            const dx = startX - ev.clientX;
            latestW = clampDetailPanelWidth(startW + dx);
            setDetailPanelWidth(latestW);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            try {
                localStorage.setItem(DETAIL_PANEL_STORAGE_KEY, String(latestW));
            }
            catch {
                /* ignore */
            }
        };
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }
    function onQuickPanelDragStart(e: ReactPointerEvent<HTMLDivElement>) {
        if (e.button !== 0)
            return;
        e.preventDefault();
        quickPanelDragRef.current = {
            pointerId: e.pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startLeft: quickPanelPos.left,
            startTop: quickPanelPos.top,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    function onQuickPanelDragMove(e: ReactPointerEvent<HTMLDivElement>) {
        const d = quickPanelDragRef.current;
        if (!d || e.pointerId !== d.pointerId)
            return;
        const left = d.startLeft + (e.clientX - d.startClientX);
        const top = d.startTop + (e.clientY - d.startClientY);
        setQuickPanelPos(clampQuickMessagePanelPos({ left, top }));
    }
    function onQuickPanelDragEnd(e: ReactPointerEvent<HTMLDivElement>) {
        const d = quickPanelDragRef.current;
        if (!d || e.pointerId !== d.pointerId)
            return;
        quickPanelDragRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        catch {
        }
        setQuickPanelPos((prev) => {
            const c = clampQuickMessagePanelPos(prev);
            try {
                localStorage.setItem(QUICK_MESSAGE_PANEL_STORAGE_KEY, JSON.stringify(c));
            }
            catch {
            }
            return c;
        });
    }
    const quickMessagePortal = composeOpen &&
        selected &&
        statusToUi(selected.status) === 'shortlisted' &&
        typeof document !== 'undefined'
        ? createPortal(<div style={{
                position: 'fixed',
                left: quickPanelPos.left,
                top: quickPanelPos.top,
                width: QUICK_MESSAGE_PANEL_WIDTH,
                maxWidth: 'min(384px, calc(100vw - 16px))',
                zIndex: 10050,
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                background: '#fff',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxShadow: '0 12px 40px rgba(15, 23, 42, 0.14)',
                boxSizing: 'border-box',
            }}>
          <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                userSelect: 'none',
            }}>
            <div onPointerDown={onQuickPanelDragStart} onPointerMove={onQuickPanelDragMove} onPointerUp={onQuickPanelDragEnd} onPointerCancel={onQuickPanelDragEnd} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    cursor: 'grab',
                    touchAction: 'none',
                    padding: '4px 2px',
                    margin: '-4px -2px',
                }}>
              <span style={{ fontSize: 14, color: '#9CA3AF', lineHeight: 1 }} aria-hidden>
                ⠿
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0B0F1F' }}>
                Quick message
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                Drag to move
              </span>
            </div>
            <button type="button" onClick={() => setComposeOpen(false)} onPointerDown={(e) => e.stopPropagation()} style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#6B7280',
                    flexShrink: 0,
                }}>
              Close
            </button>
          </div>

          {composeError && (<div style={{ fontSize: 12, color: '#DC2626' }}>{composeError}</div>)}
          {composeSent && !composeError && (<div style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Sent</div>)}

          <textarea value={composeText} onChange={(e) => setComposeText(e.target.value)} placeholder="Type a message…" rows={3} style={{
                width: '100%',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                color: '#374151',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                background: '#FAFAFA',
            }}/>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => {
                const href = hostMessagesHref(selected.locumProfile.userId, jobId);
                beforeClientNavigation(href);
                router.push(href);
            }} style={{
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #D0D5DD',
                background: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: '#374151',
            }}>
              Open Messages
            </button>

            <button type="button" disabled={composeSending || !composeText.trim()} onClick={() => {
                if (composeSending)
                    return;
                const body = composeText.trim();
                if (!body)
                    return;
                setComposeSending(true);
                setComposeError(null);
                setComposeSent(false);
                void (async () => {
                    try {
                        await messageApi.sendMessage(selected.locumProfile.userId, body, jobId ?? undefined);
                        setComposeText('');
                        setComposeSent(true);
                    }
                    catch (e) {
                        setComposeError(e instanceof Error ? e.message : 'Could not send message.');
                    }
                    finally {
                        setComposeSending(false);
                    }
                })();
            }} style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: composeSending || !composeText.trim()
                    ? '#D1D5DB'
                    : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                fontSize: 13,
                fontWeight: 700,
                cursor: composeSending || !composeText.trim() ? 'default' : 'pointer',
                fontFamily: 'inherit',
                color: '#fff',
            }}>
              {composeSending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>, document.body)
        : null;
    return (<DashLayout navItems={[...NAV]} activeHref="/host/dashboard" topbarFirstName={headerProfile?.contactFirstName ?? undefined} topbarLastName={headerProfile?.contactLastName ?? undefined}>
      
      <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
            position: 'relative',
        }}>
        <h1 style={{ fontSize: 18, margin: 0, fontWeight: 700, color: '#0f1523' }}>
          Applicants
        </h1>
        <button type="button" aria-label="Close" onClick={() => router.back()} style={{
            marginLeft: 'auto',
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            lineHeight: 1,
            color: '#6B7280',
            fontFamily: 'inherit',
        }}>
          ×
        </button>
      </div>

      {error && (<div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
          {error}
        </div>)}

      {loading ? (<div style={{ fontSize: 13, color: '#8892a4' }}>Loading…</div>) : apps.length === 0 ? (<div style={{ fontSize: 13, color: '#8892a4' }}>No applicants yet.</div>) : (<div style={{
            fontFamily: 'Inter, sans-serif',
            background: '#fff',
            border: '1px solid #D9D9D9',
            borderRadius: 10,
            width: '100%',
            overflow: 'hidden',
        }}>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: '1px solid #EFEFEF',
        }}>
            <h2 style={{
            margin: 0,
            fontWeight: 500,
            fontSize: 16,
            lineHeight: '150%',
            color: '#6B7280',
            textTransform: 'capitalize',
        }}>
              Candidates
            </h2>
            <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>
              Total · {apps.length}
            </div>
          </div>

          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 1.4fr) minmax(90px, 0.6fr) minmax(220px, 2fr) minmax(130px, 0.9fr) minmax(110px, 0.7fr)',
            padding: '12px 18px',
            alignItems: 'center',
            gap: 18,
            boxSizing: 'border-box',
        }}>
            {['NAME', 'YEARS OF EXP', 'SPECIALIZATION', 'STATUS', 'LOCUM RESPONSE'].map((h) => (<div key={h} style={{
                fontFamily: 'Hanken Grotesk, Inter, sans-serif',
                fontWeight: 600,
                fontSize: 13,
                textTransform: 'uppercase',
                color: '#6B7280',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
            }}>
              {h}
            </div>))}
          </div>

          
          <div>
            {apps.map((a, idx) => {
                const uiStatus = statusToUi(a.status);
                const canMessage = uiStatus === 'shortlisted';
                const yoe = a.locumProfile.yearsOfExperience;
                const tags = buildSpecialityTags(a.locumProfile);
                return (<div key={a.id} onClick={() => setSelected(a)} role="button" tabIndex={0} onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ')
                            setSelected(a);
                    }} style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(260px, 1.4fr) minmax(90px, 0.6fr) minmax(220px, 2fr) minmax(130px, 0.9fr) minmax(110px, 0.7fr)',
                        padding: '0 18px',
                        height: 51,
                        alignItems: 'center',
                        gap: 18,
                        borderTop: idx === 0 ? '1px solid #DEDEDE' : '1px solid #DEDEDE',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                    }}>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#9CA3AF',
                        minWidth: 20,
                        textAlign: 'right',
                        flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 15,
                        fontWeight: 500,
                        color: '#0B0F1F',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {displayName(a)}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: '#9CA3AF',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {a.locumProfile.user.email}
                      </div>
                    </div>
                  </div>

                  
                  <div style={{
                        fontSize: 15,
                        fontWeight: 500,
                        color: '#0B0F1F',
                        textAlign: 'center',
                    }}>
                    {yoe ?? '—'}
                  </div>

                  
                  <SpecialityTags specialities={tags} />

                  
                  <StatusBadge status={a.status} />

                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      background: a.locumResponse === 'ACCEPTED' ? '#D1FAE5' : a.locumResponse === 'REJECTED' ? '#FEE2E2' : '#F3F4F6',
                      color: a.locumResponse === 'ACCEPTED' ? '#065F46' : a.locumResponse === 'REJECTED' ? '#991B1B' : '#6B7280',
                    }}>
                      {a.locumResponse === 'ACCEPTED' ? 'Accepted' : a.locumResponse === 'REJECTED' ? 'Rejected' : '—'}
                    </span>
                  </div>
                </div>);
            })}
          </div>
        </div>)}

      
      {selected && (<>
          <div onClick={() => setSelected(null)} style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(28, 50, 130, 0.45)',
                zIndex: 220,
            }}/>
          <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: detailPanelWidth,
                height: '100vh',
                background: '#eef0fa',
                zIndex: 221,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
                fontFamily: 'Inter, sans-serif',
            }}>
            <div
              title="Drag to resize"
              onMouseDown={onDetailPanelResizeMouseDown}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 8,
                zIndex: 5,
                cursor: 'ew-resize',
                background: 'transparent',
              }}
            />
            <div style={{
                padding: '20px 18px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
            }}>
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                fontSize: 20,
                lineHeight: '140%',
                color: '#0B0F1F',
                textTransform: 'capitalize',
              }}>
                Professional Information
              </span>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" style={{
                all: 'unset',
                cursor: 'pointer',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <CloseIcon />
              </button>
            </div>

            
            <div style={{ padding: '0 18px 14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldIcon />
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    fontSize: 18,
                    lineHeight: '140%',
                    color: '#0B0F1F',
                    textTransform: 'capitalize',
                  }}>
                    {displayName(selected)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: '140%',
                    color: '#6B7280',
                    textTransform: 'capitalize',
                  }}>
                    {(() => {
                        const city = (selected.locumProfile as any).city as string | null | undefined;
                        const prov = (selected.locumProfile as any).province as string | null | undefined;
                        const loc = [city, prov].filter(Boolean).join(', ');
                        return loc || 'Location pending';
                    })()}
                  </span>
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: '140%',
                    color: '#6B7280',
                  }}>
                    CPSNS Number: {selected.locumProfile.cpsnsId}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" disabled={!jobId || selected.status !== 'APPLIED' || actioning.has(selected.id)} onClick={async () => {
                        if (!jobId)
                            return;
                        const app = selected;
                        setActioning((prev) => new Set(prev).add(app.id));
                        try {
                            await hostApi.updateApplication(jobId, app.id, 'SHORTLISTED');
                            setApps((prev) => prev.map((x) => x.id === app.id ? { ...x, status: 'SHORTLISTED' } : x));
                            setSelected((prev) => prev ? { ...prev, status: 'SHORTLISTED' } : prev);
                        }
                        finally {
                            setActioning((prev) => {
                                const next = new Set(prev);
                                next.delete(app.id);
                                return next;
                            });
                        }
                    }} style={{
                        all: 'unset',
                        cursor: jobId && selected.status === 'APPLIED' && !actioning.has(selected.id) ? 'pointer' : 'default',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 12px',
                        height: 44,
                        background: jobId && selected.status === 'APPLIED' && !actioning.has(selected.id)
                            ? 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)'
                            : '#E5E7EB',
                        borderRadius: 8,
                    }}>
                    <span style={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 500,
                        fontSize: 14,
                        lineHeight: '150%',
                        color: jobId && selected.status === 'APPLIED' && !actioning.has(selected.id) ? '#fff' : '#6B7280',
                        textTransform: 'capitalize',
                    }}>
                      {selected.status === 'APPLIED'
                        ? (actioning.has(selected.id) ? 'Shortlisting…' : 'Shortlist')
                        : selected.status === 'SHORTLISTED'
                            ? 'Shortlisted'
                            : selected.status === 'CONFIRMED'
                                ? 'Confirmed'
                                : selected.status === 'REJECTED'
                                    ? 'Rejected'
                                    : selected.status === 'WITHDRAWN'
                                        ? 'Withdrawn'
                                        : '—'}
                    </span>
                  </button>

                  {selected.status === 'SHORTLISTED' && (<button type="button" disabled={!jobId || actioning.has(selected.id)} onClick={async () => {
                        if (!jobId)
                            return;
                        const app = selected;
                        setActioning((prev) => new Set(prev).add(app.id));
                        try {
                            await hostApi.updateApplication(jobId, app.id, 'CONFIRMED');
                            setApps((prev) => prev.map((x) => x.id === app.id ? { ...x, status: 'CONFIRMED' } : x));
                            setSelected((prev) => prev ? { ...prev, status: 'CONFIRMED' } : prev);
                        }
                        finally {
                            setActioning((prev) => {
                                const next = new Set(prev);
                                next.delete(app.id);
                                return next;
                            });
                        }
                    }} style={{
                        all: 'unset',
                        cursor: jobId && !actioning.has(selected.id) ? 'pointer' : 'default',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 12px',
                        height: 44,
                        background: jobId && !actioning.has(selected.id)
                            ? 'linear-gradient(270deg,#6366F1 0%,#4F46E5 100%)'
                            : '#E5E7EB',
                        borderRadius: 8,
                    }}>
                    <span style={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 600,
                        fontSize: 14,
                        lineHeight: '150%',
                        color: jobId && !actioning.has(selected.id) ? '#fff' : '#6B7280',
                        textTransform: 'capitalize',
                    }}>
                      {actioning.has(selected.id) ? 'Confirming…' : 'Confirm locum'}
                    </span>
                  </button>)}

                  <button type="button" onClick={statusToUi(selected.status) === 'shortlisted'
                        ? () => {
                            setComposeOpen(true);
                            setComposeError(null);
                            setComposeSent(false);
                        }
                        : undefined} style={{
                        all: 'unset',
                        cursor: statusToUi(selected.status) === 'shortlisted' ? 'pointer' : 'default',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 12px',
                        height: 44,
                        border: `1px solid ${statusToUi(selected.status) === 'shortlisted' ? '#1C32D2' : 'rgba(107,114,128,0.5)'}`,
                        borderRadius: 8,
                    }}>
                    <span style={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 500,
                        fontSize: 14,
                        lineHeight: '150%',
                        color: statusToUi(selected.status) === 'shortlisted' ? '#1C32D2' : 'rgba(107,114,128,0.5)',
                        textTransform: 'capitalize',
                    }}>
                      Message
                    </span>
                  </button>
                </div>
              </div>

            </div>

            <div style={{ padding: '0 18px 18px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    fontSize: 16,
                    lineHeight: '140%',
                    color: '#000',
                    textTransform: 'capitalize',
                  }}>
                    About
                  </span>
                  <div>
                    <p style={{
                        margin: 0,
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 500,
                        fontSize: 14,
                        lineHeight: '150%',
                        color: '#6B7280',
                        ...(aboutExpanded
                            ? {}
                            : {
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical' as const,
                                WebkitLineClamp: 3,
                                overflow: 'hidden',
                            }),
                    }}>
                      {selected.locumProfile.summary || '—'}
                    </p>
                    {!!selected.locumProfile.summary &&
                        selected.locumProfile.summary.trim().length > 0 && (<button type="button" onClick={() => setAboutExpanded((v) => !v)} style={{
                            all: 'unset',
                            cursor: 'pointer',
                            display: 'inline-block',
                            marginTop: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#1C32D2',
                        }}>
                        {aboutExpanded ? 'Show less' : 'Show more'}
                      </button>)}
                  </div>
                </div>

                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    fontSize: 16,
                    lineHeight: '140%',
                    color: '#000',
                    textTransform: 'capitalize',
                  }}>
                    Specialization
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {(() => {
                        const specText = (selected.locumProfile as any).specializationText as string | null | undefined;
                        void specText;
                        return buildSpecialityTags(selected.locumProfile);
                    })().map((s) => (<SpecTag key={s} label={s} />))}
                  </div>
                </div>

                
                {(() => {
                    const docsRaw = Array.isArray((selected.locumProfile as any).documents)
                        ? ((selected.locumProfile as any).documents as any[])
                        : [];
                    const { primary, additional } = splitDocs(docsRaw);
                    const hasAny = primary.length > 0 || additional.length > 0;
                    const primaryPlaceholders = [
                        { key: 'CPSNS_LICENSE', label: 'CPSNS License' },
                        { key: 'CV', label: 'Resume / CV' },
                    ] as const;
                    return (<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <span style={{
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 600,
                            fontSize: 16,
                            lineHeight: '140%',
                            color: '#000',
                            textTransform: 'capitalize',
                        }}>
                            Docs
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {primary.length > 0
                                ? primary.map((d: any) => (<DocRow key={d.id} label={docLabel(String(d.documentType))} subtitle={String(d.fileName ?? '')} url={String(d.storageUrl ?? '#')} />))
                                : primaryPlaceholders.map((p) => (<DocRow key={p.key} label={p.label} subtitle="No document uploaded" url={null} />))}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <span style={{
                                fontFamily: 'Inter, sans-serif',
                                fontWeight: 600,
                                fontSize: 16,
                                lineHeight: '140%',
                                color: '#000',
                                textTransform: 'capitalize',
                            }}>
                              Additional documents
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {additional.length > 0
                                    ? additional.map((d: any) => (<DocRow key={d.id} label={docLabel(String(d.documentType))} subtitle={String(d.fileName ?? '')} url={String(d.storageUrl ?? '#')} />))
                                    : (<DocRow label="Additional documents" subtitle="No document uploaded" url={null} />)}
                            </div>
                          </div>
                      </div>);
                })()}
              </div>
            </div>
          </div>
        </>)}
      {quickMessagePortal}
    </DashLayout>);
}
