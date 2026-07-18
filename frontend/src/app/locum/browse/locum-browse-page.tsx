'use client';
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import Logo from '@/components/Logo';
import { fetchAllPaginated, locumApi, type BrowseJob } from '@/lib/api';
import { getToken, syncCookies } from '@/lib/auth';
import { beforeClientNavigation } from '@/lib/topLoader';
import { useAuth } from '@/providers/AuthProvider';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { LocumProfile } from '@/types';
import LocumAccountNotice from '@/components/LocumAccountNotice';
import { NameWithVerifiedShield } from '@/components/NameWithVerifiedShield';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import {
  getLocumApplyBlockedMessage,
  getLocumAccountNotice,
  locumCanApplyToJobs,
} from '@/lib/locumAccountNotice';
import {
  isLocalPostingEndDatePassed,
} from '@/lib/localDateTime';
import { relativeHoursOrDaysAgo, toLocalDateTime, toLocalTime } from '@/lib/relativeTime';
import {
  CANADIAN_PROVINCE_NAMES,
  filterCanadianCities,
} from '@/lib/canadianCities';
import { groupKeyResponsibilitiesForDisplay } from '@/lib/hostJobPostingForm';
import { formatHostDoctorDisplayName } from '@/lib/hostDisplayName';
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
  {
    label: 'Settings',
    href: '/locum/settings',
    icon: <NavIcon name="settings" />,
  },
];
const BROWSE_PROVINCE_NAMES = CANADIAN_PROVINCE_NAMES;
const BROWSE_LIST_WIDTH_KEY = 'll-browse-list-width';
const BROWSE_LIST_MIN = 240;
const BROWSE_LIST_MAX = 520;
const BROWSE_LIST_DEFAULT = 290;
const LOGO_TEAL = '#309BB7';
const LOGO_TEAL_BG = 'rgba(48, 155, 183, 0.14)';
const LOGO_TEAL_BORDER = 'rgba(48, 155, 183, 0.28)';
/** Cosmetic blur for host-identifying details shown to logged-out visitors. */
function LockedUntilSignIn({ children }: { children: ReactNode }) {
  return (
    <span
      title="Sign in to view"
      aria-label="Sign in to view"
      style={{
        filter: 'blur(5px)',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {children}
    </span>
  );
}

function readStoredBrowseListWidth(): number {
  if (typeof window === 'undefined') return BROWSE_LIST_DEFAULT;
  const n = parseInt(localStorage.getItem(BROWSE_LIST_WIDTH_KEY) ?? '', 10);
  if (!Number.isFinite(n)) return BROWSE_LIST_DEFAULT;
  return Math.min(BROWSE_LIST_MAX, Math.max(BROWSE_LIST_MIN, n));
}
type BrowseSearchSuggestion = {
  id: string;
  primary: string;
  secondary?: string;
  value: string;
};
const BROWSE_SUGGEST_MAX = 14;
const browseSuggestHighlight: CSSProperties = {
  background: 'rgba(59, 79, 216, 0.15)',
  color: '#1e3a8a',
  borderRadius: 2,
  fontWeight: 700,
};
function highlightBrowseMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const idx = lower.indexOf(lq);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={browseSuggestHighlight}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
function buildBrowseSearchSuggestions(
  qRaw: string,
  jobs: BrowseJob[],
): BrowseSearchSuggestion[] {
  const qt = qRaw.trim();
  if (!qt) return [];
  const q = qt.toLowerCase();
  const out: BrowseSearchSuggestion[] = [];
  const seenValue = new Set<string>();
  const push = (s: BrowseSearchSuggestion) => {
    const k = s.value.trim().toLowerCase();
    if (seenValue.has(k)) return false;
    seenValue.add(k);
    out.push(s);
    return out.length >= BROWSE_SUGGEST_MAX;
  };
  if (q.length >= 2) {
    const found = filterCanadianCities(qt, 6);
    for (const c of found) {
      if (
        push({
          id: `cat-${c.name}-${c.province}`,
          primary: c.name,
          secondary: c.province,
          value: c.name,
        })
      )
        return out;
    }
  }
  if (q.length >= 2) {
    for (const [code, name] of Object.entries(BROWSE_PROVINCE_NAMES)) {
      if (out.length >= BROWSE_SUGGEST_MAX) break;
      if (code.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
        push({
          id: `prov-${code}`,
          primary: name,
          secondary: code,
          value: code,
        });
      }
    }
  }
  const seenHostCity = new Set<string>();
  for (const j of jobs) {
    if (out.length >= BROWSE_SUGGEST_MAX) break;
    const city = (j.hostProfile.city ?? '').trim();
    const prov = (j.hostProfile.province ?? '').trim();
    if (!city) continue;
    const ck = `${city}|${prov}`;
    if (seenHostCity.has(ck)) continue;
    const cityL = city.toLowerCase();
    const provL = prov.toLowerCase();
    const provName = prov ? (BROWSE_PROVINCE_NAMES[prov] ?? prov) : '';
    if (
      cityL.includes(q) ||
      provL.includes(q) ||
      (provName && provName.toLowerCase().includes(q))
    ) {
      seenHostCity.add(ck);
      push({
        id: `jobloc-${ck}`,
        primary: city,
        secondary: prov || provName || undefined,
        value: city,
      });
    }
  }
  for (const j of jobs) {
    if (out.length >= BROWSE_SUGGEST_MAX) break;
    const t = j.title;
    if (!t.toLowerCase().includes(q)) continue;
    const sub = [j.hostProfile.city, j.hostProfile.province]
      .filter(Boolean)
      .join(', ');
    push({
      id: `title-${j.id}`,
      primary: t,
      secondary: sub || undefined,
      value: t,
    });
  }
  return out;
}
function formatUtcDateTimeToLocal(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
): { localDate: string; localTime: string } | null {
  if (!dateStr) return null;
  const time = timeStr?.trim() ? timeStr : '00:00';
  const utcIso = `${dateStr.split('T')[0]}T${time}:00Z`;
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return null;
  return {
    localDate: d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    localTime: d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}
function hasMinYearsExperience(
  value: number | null | undefined,
): value is number {
  return value != null && value > 0;
}
function formatMinYearsExperienceValue(value: number): string {
  return `${value}+`;
}
function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function hasJobEndDatePassed(job: BrowseJob): boolean {
  return isLocalPostingEndDatePassed(job.endDate ?? null);
}

function isJobRemovedByHost(job: BrowseJob): boolean {
  return Boolean(job.isDeleted);
}

const BROWSE_REMOVED_LIST_BG = '#F3F4F6';
const BROWSE_REMOVED_LIST_SELECTED_BG = '#E5E7EB';
const BROWSE_REMOVED_MUTED = '#9CA3AF';
type PostedTimeFilter = 'any' | '24h' | '7d' | '30d' | '90d';

const POSTED_TIME_FILTER_OPTIONS: { id: PostedTimeFilter; label: string }[] = [
  { id: 'any', label: 'All Postings' },
  { id: '24h', label: 'Past 24 Hours' },
  { id: '7d', label: 'Past Week' },
  { id: '30d', label: 'Past Month' },
  { id: '90d', label: 'Past 3 Months' },
];

const POSTED_WINDOW_MS: Record<Exclude<PostedTimeFilter, 'any'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

function jobPostedAtMs(job: BrowseJob): number {
  if (!job.createdAt) return 0;
  const t = new Date(job.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function jobMatchesPostedTimeFilter(
  job: BrowseJob,
  filter: PostedTimeFilter,
  nowMs: number,
): boolean {
  if (filter === 'any') return true;
  const created = jobPostedAtMs(job);
  if (!created) return false;
  return created >= nowMs - POSTED_WINDOW_MS[filter];
}
export default function LocumBrowsePage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const [jobs, setJobs] = useState<BrowseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [postedTimeFilter, setPostedTimeFilter] =
    useState<PostedTimeFilter>('any');
  const [locationSearch, setLocationSearch] = useState('');
  const [searchDropOpen, setSearchDropOpen] = useState(false);
  const [searchActiveIdx, setSearchActiveIdx] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropRef = useRef<HTMLDivElement>(null);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchActiveIdxRef = useRef(-1);
  const browseSearchSuggestions = useMemo(
    () => buildBrowseSearchSuggestions(locationSearch, jobs),
    [locationSearch, jobs],
  );
  const applyBrowseSearchSuggestion = useCallback(
    (s: BrowseSearchSuggestion) => {
      setLocationSearch(s.value);
      setSearchDropOpen(false);
      setSearchActiveIdx(-1);
    },
    [],
  );
  const handleBrowseSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!searchDropOpen || browseSearchSuggestions.length === 0) {
        if (e.key === 'Escape') setSearchDropOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchActiveIdx((i) => {
          const n = browseSearchSuggestions.length;
          if (n === 0) return -1;
          if (i < 0) return 0;
          return Math.min(i + 1, n - 1);
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchActiveIdx((i) => (i <= 0 ? -1 : i - 1));
      } else if (e.key === 'Enter') {
        const idx = searchActiveIdxRef.current;
        const picked = idx >= 0 ? browseSearchSuggestions[idx] : undefined;
        if (picked) {
          e.preventDefault();
          applyBrowseSearchSuggestion(picked);
        }
      } else if (e.key === 'Escape') {
        setSearchDropOpen(false);
      }
    },
    [searchDropOpen, browseSearchSuggestions, applyBrowseSearchSuggestion],
  );
  useEffect(() => {
    setSearchActiveIdx(-1);
  }, [locationSearch]);
  useEffect(() => {
    searchActiveIdxRef.current = searchActiveIdx;
  }, [searchActiveIdx]);
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        searchDropRef.current?.contains(t) ||
        searchInputRef.current?.contains(t)
      ) {
        return;
      }
      setSearchDropOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);
  useEffect(
    () => () => {
      if (searchBlurTimer.current != null)
        clearTimeout(searchBlurTimer.current);
    },
    [],
  );
  const router = useRouter();
  const { isLoading: authLoading } = useAuth();
  const [loggedIn, setLoggedIn] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState('');
  const [profile, setProfile] = useState<LocumProfile | null>(null);
  const [listPanelWidth, setListPanelWidth] = useState(readStoredBrowseListWidth);
  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllPaginated((cursor) =>
        locumApi.browseJobs({ cursor, limit: 100 }),
      );
      setJobs(data);
      if (data.length > 0 && window.innerWidth > 768) setSelectedId(data[0].id);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);
  useEffect(() => {
    if (authLoading) return;
    syncCookies();
    setLoggedIn(Boolean(getToken()));
    setAuthResolved(true);
  }, [authLoading]);
  useEffect(() => {
    if (!getToken()) return;
    locumApi
      .getProfile()
      .then((data) => {
        if (data.exists && data.profile) setProfile(data.profile);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!getToken()) return;
    fetchAllPaginated((cursor) => locumApi.getMyApplications({ cursor, limit: 100 }))
      .then((applications) => {
        const ids = new Set(
          applications
            .map((a) => a.jobPosting?.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        );
        setApplied(ids);
      })
      .catch(() => {});
  }, []);
  const filteredJobs = useMemo(() => {
    const nowMs = Date.now();
    let result = jobs.filter(
      (j) =>
        !isJobRemovedByHost(j) &&
        jobMatchesPostedTimeFilter(j, postedTimeFilter, nowMs),
    );
    if (locationSearch.trim()) {
      const q = locationSearch.trim().toLowerCase();
      const isMatch = (j: BrowseJob): boolean => {
        const city = (j.hostProfile.city ?? '').toLowerCase();
        const prov = (j.hostProfile.province ?? '').toLowerCase();
        const loc = (j.location ?? '').toLowerCase();
        const title = (j.title ?? '').toLowerCase();
        return (
          city.includes(q) ||
          prov.includes(q) ||
          loc.includes(q) ||
          title.includes(q)
        );
      };
      const matchRank = (j: BrowseJob): number => {
        const city = (j.hostProfile.city ?? '').toLowerCase();
        const prov = (j.hostProfile.province ?? '').toLowerCase();
        const loc = (j.location ?? '').toLowerCase();
        const title = (j.title ?? '').toLowerCase();
        if (city.startsWith(q)) return 0;
        if (prov.startsWith(q)) return 1;
        if (city.includes(q)) return 2;
        if (prov.includes(q)) return 3;
        if (loc.includes(q)) return 4;
        if (title.includes(q)) return 5;
        return 6;
      };
      const toCreatedAtMs = (j: BrowseJob): number => {
        if (!j.createdAt) return 0;
        const t = new Date(j.createdAt).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      const matches: BrowseJob[] = [];
      const rest: BrowseJob[] = [];
      for (const j of result) {
        (isMatch(j) ? matches : rest).push(j);
      }
      matches.sort((a, b) => {
        const ra = matchRank(a);
        const rb = matchRank(b);
        if (ra !== rb) return ra - rb;
        return toCreatedAtMs(b) - toCreatedAtMs(a);
      });
      rest.sort((a, b) => toCreatedAtMs(b) - toCreatedAtMs(a));
      result = [...matches, ...rest];
    }
    else if (postedTimeFilter !== 'any') {
      result = [...result].sort(
        (a, b) => jobPostedAtMs(b) - jobPostedAtMs(a),
      );
    }
    return result;
  }, [jobs, postedTimeFilter, locationSearch]);
  useEffect(() => {
    if (
      filteredJobs.length > 0 &&
      !filteredJobs.find((j) => j.id === selectedId)
    ) {
      if (window.innerWidth > 768) setSelectedId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedId]);
  const job = filteredJobs.find((j) => j.id === selectedId) ?? null;
  const selectedJobPassed = job ? hasJobEndDatePassed(job) : false;
  const selectedJobRemoved = job ? isJobRemovedByHost(job) : false;
  const selectedJobUnavailable = selectedJobPassed || selectedJobRemoved;
  const accountNotice = getLocumAccountNotice(profile);
  const canApply = locumCanApplyToJobs(profile);
  const cpsnsVerified = isCpsnsVerificationApproved(profile?.cpsnsVerificationStatus);
  async function handleApply(jobId: string) {
    if (applied.has(jobId)) return;
    syncCookies();
    if (!getToken()) {
      beforeClientNavigation('/auth');
      router.push('/auth?role=locum&next=/locum/browse');
      return;
    }
    const targetJob = jobs.find((j) => j.id === jobId);
    if (targetJob && isJobRemovedByHost(targetJob)) {
      setApplyError('This posting has been removed by the host.');
      return;
    }
    if (targetJob && hasJobEndDatePassed(targetJob)) {
      setApplyError('This job has passed.');
      return;
    }
    if (!canApply) {
      setApplyError(getLocumApplyBlockedMessage(profile));
      return;
    }
    setApplying(jobId);
    setApplyError('');
    try {
      await locumApi.applyToJob(jobId);
      syncCookies();
      setApplied((prev) => new Set([...prev, jobId]));
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Failed to apply. Please try again.';
      if (msg.toLowerCase().includes('already')) {
        setApplied((prev) => new Set([...prev, jobId]));
      } else {
        setApplyError(msg);
      }
    } finally {
      setApplying(null);
    }
  }
  const isApplied = (id: string) => applied.has(id);
  const isApplying = (id: string) => applying === id;
  const applyAllowed =
    !selectedJobUnavailable && !isApplied(job?.id ?? '') && !isApplying(job?.id ?? '');
  const applyReady = loggedIn ? canApply && applyAllowed : applyAllowed;
  function onBrowseListResizeMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = listPanelWidth;
    let latest = startW;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      latest = Math.min(
        BROWSE_LIST_MAX,
        Math.max(BROWSE_LIST_MIN, startW + dx),
      );
      setListPanelWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(BROWSE_LIST_WIDTH_KEY, String(latest));
      } catch {
        /* ignore */
      }
    };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  const displayName = profile?.firstName
    ? `Dr ${profile.firstName}${profile.lastName ? ` ${profile.lastName}` : ''}`
    : loggedIn
      ? 'Doctor'
      : null;
  const welcomeLine = displayName ?? 'Browse available shifts';
  const pageContent = (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#0f1523',
              marginBottom: 3,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <NameWithVerifiedShield verified={loggedIn && cpsnsVerified}>
              <span>{loggedIn ? `Welcome ${displayName}` : welcomeLine}</span>
            </NameWithVerifiedShield>
          </h1>
          <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 14 }}></p>

          {!loggedIn ? (
            <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 14 }}>
              Sign in to apply for shifts. Browsing is free — no account required.
            </p>
          ) : null}

          {loggedIn && !canApply && profile && accountNotice ? (
            <LocumAccountNotice profile={profile} />
          ) : null}
          {loggedIn && !canApply && profile && !accountNotice ? (
            <div
              style={{
                marginBottom: 14,
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid #FDE68A',
                background: '#FFFBEB',
                fontSize: 12,
                color: '#92400E',
                lineHeight: 1.5,
              }}
            >
              <strong>CPSNS verification required:</strong> Only locums with
              admin-approved CPSNS can apply. Please ensure your{' '}
              <a
                href="/locum/profile"
                style={{
                  color: '#0F2A7A',
                  fontWeight: 'var(--font-weight-bold)',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = '#3B4FD8')
                }
                onMouseLeave={(e) => (e.currentTarget.style.color = '#0F2A7A')}
              >
                CPSNS number
              </a>{' '}
              is verified.
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {POSTED_TIME_FILTER_OPTIONS.map((opt) => {
                const selected = postedTimeFilter === opt.id;
                const labelExtra =
                  opt.id === 'any' ? ` (${jobs.length})` : '';
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPostedTimeFilter(opt.id)}
                    title={
                      opt.id === 'any'
                        ? 'Show all jobs regardless of posting date'
                        : `Only jobs posted in the ${opt.label.toLowerCase()}`
                    }
                    style={{
                      padding: '7px 12px',
                      border: `1px solid ${selected ? '#3B4FD8' : '#e2e5ee'}`,
                      borderRadius: '6px 6px 0 0',
                      background: selected ? '#fff' : '#F1F3F7',
                      fontSize: 12,
                      fontWeight: selected ? 600 : 400,
                      color: selected ? '#3B4FD8' : '#8892a4',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {opt.label}
                    {labelExtra}
                  </button>
                );
              })}
            </div>

            <div
              className="browse-search-wrap"
              style={{
                position: 'relative',
                display: 'inline-block',
              }}
            >
              <input
                ref={searchInputRef}
                type="text"
                value={locationSearch}
                autoComplete="off"
                role="combobox"
                aria-expanded={searchDropOpen}
                aria-controls="locum-browse-search-listbox"
                aria-autocomplete="list"
                onChange={(e) => {
                  const v = e.target.value;
                  setLocationSearch(v);
                  if (searchBlurTimer.current != null) {
                    clearTimeout(searchBlurTimer.current);
                  }
                  const next = buildBrowseSearchSuggestions(v, jobs);
                  setSearchDropOpen(next.length > 0);
                }}
                onKeyDown={handleBrowseSearchKeyDown}
                placeholder="Search by City, Province, or Title"
                style={{
                  height: 34,
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '4px 10px',
                  border: '1px solid #e2e5ee',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  outline: 'none',
                  color: '#0f1523',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#3B4FD8';
                  if (searchBlurTimer.current != null) {
                    clearTimeout(searchBlurTimer.current);
                  }
                  const next = buildBrowseSearchSuggestions(
                    e.target.value,
                    jobs,
                  );
                  if (next.length) setSearchDropOpen(true);
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e2e5ee';
                  searchBlurTimer.current = setTimeout(
                    () => setSearchDropOpen(false),
                    170,
                  );
                }}
              />
              {searchDropOpen && browseSearchSuggestions.length > 0 && (
                <div
                  id="locum-browse-search-listbox"
                  ref={searchDropRef}
                  role="listbox"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 300,
                    background: '#fff',
                    border: '1px solid #e2e5ee',
                    borderRadius: 6,
                    boxShadow: '0 8px 24px rgba(15, 21, 35, 0.12)',
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}
                >
                  {browseSearchSuggestions.map((s, i) => (
                    <div
                      key={s.id}
                      role="option"
                      aria-selected={i === searchActiveIdx}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        if (searchBlurTimer.current != null) {
                          clearTimeout(searchBlurTimer.current);
                        }
                        applyBrowseSearchSuggestion(s);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                        borderBottom: '1px solid #f3f4f6',
                        background:
                          i === searchActiveIdx ? '#eef0fb' : 'transparent',
                        color: '#0f1523',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 500,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {highlightBrowseMatch(s.primary, locationSearch)}
                      </span>
                      {s.secondary ? (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#3B4FD8',
                            background: 'rgba(59, 79, 216, 0.1)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {s.secondary}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {locationSearch && (
              <button
                type="button"
                onClick={() => {
                  setLocationSearch('');
                  setSearchDropOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  border: 'none',
                  background: 'none',
                  color: '#8892a4',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✕ Clear
              </button>
            )}

            {(locationSearch || postedTimeFilter !== 'any') && (
              <span style={{ fontSize: 11, color: '#8892a4' }}>
                Showing {filteredJobs.length} of {jobs.length}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            border: '1px solid #e2e5ee',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <div
            className={selectedId ? 'browse-list-panel browse-list-panel--hidden-mobile' : 'browse-list-panel'}
            style={{
              width: listPanelWidth,
              flexShrink: 0,
              minHeight: 0,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid #e2e5ee',
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid #e2e5ee',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0f1523',
                  marginBottom: 2,
                }}
              >
                {postedTimeFilter === 'any' && !locationSearch.trim()
                  ? 'Top Picks for you'
                  : 'Matching postings'}
              </div>
            </div>

            {loading && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#8892a4',
                }}
              >
                Loading jobs…
              </div>
            )}

            {!loading && filteredJobs.length === 0 && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#8892a4',
                }}
              >
                {locationSearch.trim()
                  ? `No jobs matching "${locationSearch.trim()}".`
                  : postedTimeFilter !== 'any'
                    ? 'No jobs were posted in this time range.'
                    : 'No jobs available right now.'}
              </div>
            )}

            {!loading &&
              filteredJobs.map((j) => {
                const removed = isJobRemovedByHost(j);
                const selected = selectedId === j.id;
                return (
                <div
                  key={j.id}
                  onClick={() => setSelectedId(j.id)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    background: removed
                      ? selected
                        ? BROWSE_REMOVED_LIST_SELECTED_BG
                        : BROWSE_REMOVED_LIST_BG
                      : selected
                        ? '#eef0fb'
                        : '#fff',
                    position: 'relative',
                    opacity: removed ? 0.88 : 1,
                  }}
                >
                  {selected && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        background: removed ? '#9CA3AF' : '#3B4FD8',
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 'var(--font-heading)',
                        fontWeight: 'var(--font-weight-bold)',
                        lineHeight: '140%',
                        color: removed ? BROWSE_REMOVED_MUTED : 'var(--brand-primary)',
                      }}
                    >
                      {(() => {
                        const maxChars = Math.max(
                          18,
                          Math.floor((listPanelWidth - 72) / 7),
                        );
                        return j.title.length > maxChars
                          ? j.title.slice(0, maxChars) + '…'
                          : j.title;
                      })()}
                    </span>
                    <span
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 'var(--font-small)',
                        fontWeight: 'var(--font-weight-normal)',
                        lineHeight: '140%',
                        color: removed ? BROWSE_REMOVED_MUTED : 'var(--text-secondary)',
                        flexShrink: 0,
                        marginLeft: 6,
                      }}
                    >
                      <span title={toLocalDateTime(j.createdAt)} style={{ cursor: 'help', borderBottom: '1px dotted currentColor' }}>{daysAgo(j.createdAt)}d ago</span>
                    </span>
                  </div>
                  {removed ? (
                    <span
                      style={{
                        display: 'inline-block',
                        marginBottom: 4,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: '#E5E7EB',
                        color: '#6B7280',
                        fontSize: 'var(--font-small)',
                        fontWeight: 600,
                      }}
                    >
                      Posting removed
                    </span>
                  ) : null}
                  <div
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 'var(--font-body)',
                      fontWeight: 'var(--font-weight-normal)',
                      lineHeight: '150%',
                      color: removed ? BROWSE_REMOVED_MUTED : 'var(--text-muted)',
                      textTransform: 'capitalize',
                      marginBottom: 4,
                    }}
                  >
                    {loggedIn ? (
                      <>
                        {j.hostProfile.city}, {j.hostProfile.province}
                      </>
                    ) : (
                      <LockedUntilSignIn>
                        {j.hostProfile.city}, {j.hostProfile.province}
                      </LockedUntilSignIn>
                    )}
                  </div>
                  {(j.startDate || j.endDate) && (() => {
                    const start = formatUtcDateTimeToLocal(j.startDate, j.startTime);
                    const end = formatUtcDateTimeToLocal(j.endDate, j.endTime);
                    if (!start && !end) return null;
                    return (
                    <div
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 'var(--font-small)',
                        fontWeight: 'var(--font-weight-normal)',
                        lineHeight: '140%',
                        color: removed ? BROWSE_REMOVED_MUTED : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Image
                        src="/calender.svg"
                        alt=""
                        width={12}
                        height={12}
                        style={{ flexShrink: 0, objectFit: 'contain' }}
                      />
                      {start?.localDate ?? '—'} – {end?.localDate ?? '—'}
                    </div>
                    );
                  })()}

                  {isApplied(j.id) && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 4,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: removed ? '#E5E7EB' : '#d1fae5',
                        color: removed ? '#6B7280' : '#065f46',
                        fontSize: 'var(--font-small)',
                        fontWeight: 'var(--font-weight-bold)',
                      }}
                    >
                      ✓ Applied
                    </span>
                  )}
                </div>
              );
              })}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize job list"
              title="Drag to resize"
              onMouseDown={onBrowseListResizeMouseDown}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 6,
                zIndex: 3,
                cursor: 'ew-resize',
                background: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 79, 216, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            />
          </div>

          {job ? (
            <div
              className={selectedId ? 'browse-detail-panel browse-detail-panel--open' : 'browse-detail-panel'}
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <button
                className="browse-back-btn"
                onClick={() => setSelectedId(null)}
                style={{
                  display: 'none',
                  alignItems: 'center',
                  gap: 8,
                  background: '#fff',
                  border: 'none',
                  borderBottom: '1px solid #E5E7EB',
                  cursor: 'pointer',
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#0F2A7A',
                  fontFamily: 'inherit',
                  width: '100%',
                  textAlign: 'left',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Back to Opportunities
              </button>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '18px 20px',
                  opacity: selectedJobRemoved ? 0.9 : 1,
                }}
              >
                {selectedJobRemoved ? (
                  <p
                    style={{
                      fontSize: 'var(--font-small)',
                      fontWeight: 600,
                      color: '#6B7280',
                      background: '#F3F4F6',
                      border: '1px solid #E5E7EB',
                      borderRadius: 6,
                      padding: '8px 12px',
                      marginBottom: 12,
                    }}
                  >
                    This opportunity was removed by the host and is no longer accepting
                    applications.
                  </p>
                ) : null}
                {(() => {
                  const hostDoctorName = formatHostDoctorDisplayName(
                    job.hostProfile.contactFirstName,
                    job.hostProfile.contactLastName,
                  );
                  const hostCpsnsVerified = isCpsnsVerificationApproved(
                    job.hostProfile.cpsnsVerificationStatus,
                  );
                  return (
                    <div style={{ marginBottom: 6 }}>
                      <div
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 'var(--font-weight-bold)',
                          fontSize: '1.125rem',
                          lineHeight: '120%',
                          color: '#0f1523',
                          marginBottom: hostDoctorName ? 4 : 0,
                        }}
                      >
                        {loggedIn ? (
                          job.hostProfile.practiceName
                        ) : (
                          <LockedUntilSignIn>
                            {job.hostProfile.practiceName}
                          </LockedUntilSignIn>
                        )}
                      </div>
                      {hostDoctorName ? (
                        loggedIn ? (
                          <NameWithVerifiedShield
                            verified={hostCpsnsVerified}
                            shieldSize={18}
                            gap={6}
                          >
                            <span
                              style={{
                                fontFamily: 'Inter, sans-serif',
                                fontWeight: 600,
                                fontSize: 'var(--font-heading)',
                                lineHeight: '120%',
                                color: '#5a6478',
                              }}
                            >
                              {hostDoctorName}
                            </span>
                          </NameWithVerifiedShield>
                        ) : (
                          <span
                            style={{
                              fontFamily: 'Inter, sans-serif',
                              fontWeight: 600,
                              fontSize: 'var(--font-heading)',
                              lineHeight: '120%',
                              color: '#5a6478',
                            }}
                          >
                            <LockedUntilSignIn>{hostDoctorName}</LockedUntilSignIn>
                          </span>
                        )
                      ) : null}
                      {!loggedIn ? (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 'var(--font-small)',
                            color: '#8892a4',
                          }}
                        >
                          🔒 Sign in to view clinic name, host, and location
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
                <h2
                  style={{
                    fontSize: 'var(--font-heading)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: '#0f1523',
                    marginBottom: 4,
                  }}
                >
                  {job.title}
                </h2>
                <p
                  style={{
                    fontSize: 'var(--font-small)',
                    fontWeight: 600,
                    color: LOGO_TEAL,
                    marginBottom: 12,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: LOGO_TEAL_BG,
                    border: `1px solid ${LOGO_TEAL_BORDER}`,
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                  }}
                >
                  {loggedIn ? (
                    <>
                      {job.hostProfile.city}, {job.hostProfile.province}
                    </>
                  ) : (
                    <LockedUntilSignIn>
                      {job.hostProfile.city}, {job.hostProfile.province}
                    </LockedUntilSignIn>
                  )}{' '}
                  ·{' '}
                  {' '}<span title={toLocalDateTime(job.createdAt)} style={{ cursor: 'help', borderBottom: '1px dotted currentColor' }}>{relativeHoursOrDaysAgo(job.createdAt)}</span> ·{' '}
                  {job.applicationsCount} applicant
                  {job.applicationsCount !== 1 ? 's' : ''}
                </p>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 14,
                  }}
                >
                  {(job.startDate || job.endDate) && (() => {
                    const start = formatUtcDateTimeToLocal(job.startDate, job.startTime);
                    const end = formatUtcDateTimeToLocal(job.endDate, job.endTime);
                    if (!start && !end) return null;
                    return (
                    <span
                      style={{
                        background: LOGO_TEAL_BG,
                        border: `1px solid ${LOGO_TEAL_BORDER}`,
                        padding: '5px 10px',
                        borderRadius: 5,
                        fontSize: 'var(--font-small)',
                        fontWeight: 600,
                        color: LOGO_TEAL,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Image
                        src="/calender.svg"
                        alt=""
                        width={14}
                        height={14}
                        style={{ flexShrink: 0, objectFit: 'contain' }}
                      />
                      {start?.localDate ?? '—'} – {end?.localDate ?? '—'}
                    </span>
                    );
                  })()}
                  {(job.startTime || job.endTime) && (() => {
                    const start = formatUtcDateTimeToLocal(job.startDate, job.startTime);
                    const end = formatUtcDateTimeToLocal(job.endDate, job.endTime);
                    if (!start && !end) return null;
                    return (
                    <span
                      style={{
                        background: LOGO_TEAL_BG,
                        border: `1px solid ${LOGO_TEAL_BORDER}`,
                        padding: '5px 10px',
                        borderRadius: 5,
                        fontSize: 'var(--font-small)',
                        fontWeight: 600,
                        color: LOGO_TEAL,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Image
                        src="/clock.svg"
                        alt=""
                        width={14}
                        height={14}
                        style={{ flexShrink: 0, objectFit: 'contain' }}
                      />
                      {start?.localTime ?? '—'} – {end?.localTime ?? '—'}
                    </span>
                    );
                  })()}
                  {job.payPerDay && (
                    <span
                      style={{
                        background: LOGO_TEAL_BG,
                        border: `1px solid ${LOGO_TEAL_BORDER}`,
                        padding: '5px 10px',
                        borderRadius: 5,
                        fontSize: 'var(--font-small)',
                        color: LOGO_TEAL,
                        fontWeight: 'var(--font-weight-bold)',
                      }}
                    >
                      ${Number(job.payPerDay).toLocaleString()}/day
                    </span>
                  )}
                  {hasMinYearsExperience(job.minYearsExperience) && (
                    <span
                      style={{
                        background: LOGO_TEAL_BG,
                        border: `1px solid ${LOGO_TEAL_BORDER}`,
                        padding: '5px 10px',
                        borderRadius: 5,
                        fontSize: 'var(--font-small)',
                        fontWeight: 600,
                        color: LOGO_TEAL,
                      }}
                    >
                      Years of Experience{' '}
                      {formatMinYearsExperienceValue(job.minYearsExperience)}
                    </span>
                  )}
                  {job.isRural && (
                    <span
                      style={{
                        background: '#FFF7ED',
                        padding: '5px 10px',
                        borderRadius: 5,
                        fontSize: 'var(--font-small)',
                        color: '#9a3412',
                      }}
                    >
                      🌾 Rural
                    </span>
                  )}
                  {job.accommodationProvided && (
                    <span
                      style={{
                        background: '#EFF6FF',
                        padding: '5px 10px',
                        borderRadius: 5,
                        fontSize: 'var(--font-small)',
                        color: '#1e40af',
                      }}
                    >
                      🏠 Accommodation
                    </span>
                  )}
                </div>

                {job.description?.trim() && (
                  <>
                    <h4
                      style={{
                        fontSize: 'var(--font-heading)',
                        fontWeight: 'var(--font-weight-bold)',
                        color: '#0f1523',
                        marginBottom: 6,
                      }}
                    >
                      About the Job
                    </h4>
                    <p
                      style={{
                        fontSize: 'var(--font-body)',
                        color: '#5a6478',
                        lineHeight: 1.7,
                        marginBottom: 14,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {job.description.trim()}
                    </p>
                  </>
                )}

                {(job.requiredCredentials.length > 0 ||
                  hasMinYearsExperience(job.minYearsExperience)) && (
                  <>
                    <h4
                      style={{
                        fontSize: 'var(--font-heading)',
                        fontWeight: 'var(--font-weight-bold)',
                        color: '#0f1523',
                        marginBottom: 8,
                      }}
                    >
                      Requirements
                    </h4>
                    {job.requiredCredentials.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div
                          style={{
                            fontSize: 'var(--font-small)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: '#374151',
                            marginBottom: 5,
                          }}
                        >
                          Required Credentials
                        </div>
                        <div
                          style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                        >
                          {job.requiredCredentials.map((s) => (
                            <span
                              key={s}
                              style={{
                                padding: '3px 10px',
                                borderRadius: 20,
                                border: '1px solid #e2e5ee',
                                fontSize: 'var(--font-small)',
                                color: '#374151',
                              }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasMinYearsExperience(job.minYearsExperience) && (
                      <div style={{ marginBottom: 14 }}>
                        <div
                          style={{
                            fontSize: 'var(--font-body)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: '#374151',
                            marginBottom: 4,
                          }}
                        >
                          Years of Experience
                        </div>
                        <div style={{ fontSize: 'var(--font-body)', color: '#5a6478' }}>
                          {formatMinYearsExperienceValue(job.minYearsExperience)}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {job.keyResponsibilities.length > 0 && (() => {
                  const grouped = groupKeyResponsibilitiesForDisplay(
                    job.keyResponsibilities,
                  );
                  return (
                    <>
                      <h4
                        style={{
                          fontSize: 'var(--font-heading)',
                          fontWeight: 'var(--font-weight-bold)',
                          color: '#0f1523',
                          marginBottom: 6,
                        }}
                      >
                        Key Responsibilities
                      </h4>
                      <div style={{ marginBottom: 14 }}>
                        {grouped.sections.map((section) => (
                          <div
                            key={section.title}
                            style={{ marginBottom: 10 }}
                          >
                            <div
                              style={{
                                fontSize: 'var(--font-body)',
                                fontWeight: 'var(--font-weight-bold)',
                                color: '#374151',
                                marginBottom: 4,
                              }}
                            >
                              {section.title}
                            </div>
                            <ul
                              style={{
                                paddingLeft: 16,
                                margin: 0,
                              }}
                            >
                              {section.items.map((item) => (
                                <li
                                  key={item}
                                  style={{
                                    fontSize: 'var(--font-body)',
                                    color: '#5a6478',
                                    lineHeight: 1.7,
                                    marginBottom: 3,
                                  }}
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {grouped.other.length > 0 && (
                          <div>
                            <div
                              style={{
                                fontSize: 'var(--font-body)',
                                fontWeight: 'var(--font-weight-bold)',
                                color: '#374151',
                                marginBottom: 4,
                              }}
                            >
                              Other
                            </div>
                            <ul
                              style={{
                                paddingLeft: 16,
                                margin: 0,
                              }}
                            >
                              {grouped.other.map((item) => (
                                <li
                                  key={item}
                                  style={{
                                    fontSize: 'var(--font-body)',
                                    color: '#5a6478',
                                    lineHeight: 1.7,
                                    marginBottom: 3,
                                  }}
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                <h4
                  style={{
                    fontSize: 'var(--font-heading)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: '#0f1523',
                    marginBottom: 8,
                  }}
                >
                  About{' '}
                  {loggedIn ? (
                    job.hostProfile.practiceName
                  ) : (
                    <LockedUntilSignIn>
                      {job.hostProfile.practiceName}
                    </LockedUntilSignIn>
                  )}
                </h4>
                <div
                  style={{
                    fontSize: 'var(--font-body)',
                    color: '#5a6478',
                    lineHeight: 1.8,
                    marginBottom: 12,
                  }}
                >
                  {job.hostProfile.address && (
                    <>
                      <strong style={{ color: '#374151', fontWeight: 'var(--font-weight-bold)' }}>Location:</strong>{' '}
                      {loggedIn ? (
                        job.hostProfile.address
                      ) : (
                        <LockedUntilSignIn>
                          {job.hostProfile.address}
                        </LockedUntilSignIn>
                      )}
                      <br />
                    </>
                  )}
                  {job.hostProfile.practiceType && (
                    <>
                      <strong style={{ color: '#374151', fontWeight: 'var(--font-weight-bold)' }}>
                        Practice Type:
                      </strong>{' '}
                      {job.hostProfile.practiceType}
                      <br />
                    </>
                  )}
                  {job.hostProfile.emr && (
                    <>
                      <strong style={{ color: '#374151', fontWeight: 'var(--font-weight-bold)' }}>EMR System:</strong>{' '}
                      {job.hostProfile.emr}
                      <br />
                    </>
                  )}
                </div>

                {job.hostProfile.highlights?.trim() && (
                  <>
                    <h4
                      style={{
                        fontSize: 'var(--font-heading)',
                        fontWeight: 'var(--font-weight-bold)',
                        color: '#0f1523',
                        marginBottom: 6,
                      }}
                    >
                      Clinic description
                    </h4>
                    <p
                      style={{
                        fontSize: 'var(--font-body)',
                        color: '#5a6478',
                        lineHeight: 1.7,
                        marginBottom: 14,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {job.hostProfile.highlights.trim()}
                    </p>
                  </>
                )}

                {job.hostProfile.servicesOffered.length > 0 && (
                  <>
                    <h4
                      style={{
                        fontSize: 'var(--font-heading)',
                        fontWeight: 'var(--font-weight-bold)',
                        color: '#0f1523',
                        marginBottom: 7,
                      }}
                    >
                      Amenities
                    </h4>
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                        marginBottom: 0,
                      }}
                    >
                      {job.hostProfile.servicesOffered.map((a) => (
                        <span
                          key={a}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 20,
                            border: '1px solid #e2e5ee',
                            fontSize: 'var(--font-small)',
                            color: '#374151',
                          }}
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div
                style={{
                  flexShrink: 0,
                  borderTop: '1px solid #e2e5ee',
                  padding: '12px 20px 14px',
                  background: '#fff',
                  boxShadow: '0 -6px 16px rgba(15, 21, 35, 0.06)',
                }}
              >
                {applyError && (
                  <p
                    style={{ fontSize: 'var(--font-small)', color: '#dc2626', marginBottom: 8 }}
                  >
                    {applyError}
                  </p>
                )}
                <span
                  title={
                    isApplied(job.id)
                      ? 'You have already applied to this job'
                      : selectedJobRemoved
                        ? 'This posting was removed by the host'
                        : selectedJobPassed
                          ? 'This job has passed'
                          : !loggedIn
                            ? 'Sign in to apply for this shift'
                            : !canApply
                              ? accountNotice?.title ?? 'Verify CPSNS to apply'
                              : undefined
                  }
                  style={{ display: 'inline-block' }}
                >
                  <button
                    type="button"
                    onClick={() => handleApply(job.id)}
                    disabled={!applyReady}
                    style={{
                      height: 34,
                      padding: '0 14px',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 'var(--font-body)',
                      fontWeight: 'var(--font-weight-bold)',
                      fontFamily: 'inherit',
                      cursor:
                        !applyReady
                          ? 'not-allowed'
                          : isApplying(job.id)
                            ? 'wait'
                            : 'pointer',
                      background:
                        !applyReady
                          ? '#e5e7eb'
                          : 'linear-gradient(135deg, #0F2A7A 0%, #1E3FAF 100%)',
                      color:
                        !applyReady
                          ? '#9ca3af'
                          : '#fff',
                      boxShadow:
                        !applyReady
                          ? 'none'
                          : '0 2px 10px rgba(15, 42, 122, 0.22)',
                      opacity: isApplying(job.id) ? 0.88 : 1,
                    }}
                  >
                    {isApplying(job.id)
                      ? 'Applying…'
                      : isApplied(job.id)
                        ? 'Applied'
                        : selectedJobRemoved
                          ? 'Posting removed'
                          : !loggedIn
                            ? 'Sign in to apply'
                            : 'Apply'}
                  </button>
                </span>
              </div>
            </div>
          ) : (
            !loading && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8892a4',
                  fontSize: 'var(--font-body)',
                }}
              >
                {filteredJobs.length === 0
                  ? 'No jobs match your search.'
                  : 'Select a job to view details'}
              </div>
            )
          )}
        </div>
      </div>
  );

  if (!authResolved) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8892a4',
          fontSize: 14,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#F7F8FA',
        }}
      >
        <header
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 20px',
            background: '#fff',
            borderBottom: '1px solid #e2e5ee',
          }}
        >
          <Logo size="md" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                beforeClientNavigation('/auth');
                router.push('/auth?role=locum&next=/locum/browse');
              }}
              style={{
                height: 34,
                padding: '0 16px',
                border: '1px solid #0F2A7A',
                borderRadius: 6,
                background: '#fff',
                color: '#0F2A7A',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                beforeClientNavigation('/auth');
                router.push('/auth?mode=signup&role=locum&next=/locum/browse');
              }}
              style={{
                height: 34,
                padding: '0 16px',
                border: 'none',
                borderRadius: 6,
                background: 'linear-gradient(135deg, #0F2A7A 0%, #1E3FAF 100%)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Sign up
            </button>
          </div>
        </header>
        <main
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 20px 20px',
          }}
        >
          {pageContent}
        </main>
      </div>
    );
  }

  return (
    <DashLayout
      navItems={NAV}
      activeHref="/locum/browse"
      topbarFirstName={profile?.firstName}
      topbarLastName={profile?.lastName}
    >
      {pageContent}
    </DashLayout>
  );
}
