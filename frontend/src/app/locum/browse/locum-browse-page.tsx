'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { locumApi, type BrowseJob } from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { LocumProfile } from '@/types';
import { isCpsnsVerified } from '@/lib/cpsnsVerify';
import { relativeHoursOrDaysAgo } from '@/lib/relativeTime';

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

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LocumBrowsePage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const [jobs, setJobs] = useState<BrowseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── FIX Issue 11: filter state + search ──────────────────────────────────
  const [filterTab, setFilterTab] = useState<'all' | 'location' | 'date'>(
    'all',
  );
  const [locationSearch, setLocationSearch] = useState('');

  // ── FIX Issue 12a: pre-populate applied set from API on mount ─────────────
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState('');

  // ── FIX Issue 12b: real profile name, not hardcoded ───────────────────────
  const [profile, setProfile] = useState<LocumProfile | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { jobs: data } = await locumApi.browseJobs();
      setJobs(data);
      if (data.length > 0) setSelectedId(data[0].id);
    } catch {
      // silently fail — user sees empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Load profile
  useEffect(() => {
    locumApi
      .getProfile()
      .then((data) => {
        if (data.exists && data.profile) setProfile(data.profile);
      })
      .catch(() => {});
  }, []);

  // ── FIX Issue 12a: fetch existing applications so Apply button shows ✓ ────
  useEffect(() => {
    locumApi
      .getMyApplications()
      .then(({ applications }) => {
        const ids = new Set(
          applications.map(
            (a: { jobPosting: { id: string } }) => a.jobPosting.id,
          ),
        );
        setApplied(ids);
      })
      .catch(() => {});
  }, []);

  // ── FIX Issue 11: derive filteredJobs from tab + search ───────────────────
  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    // Apply location search (search by city, province, or location string)
    if (locationSearch.trim()) {
      const q = locationSearch.trim().toLowerCase();
      result = result.filter(
        (j) =>
          j.hostProfile.city?.toLowerCase().includes(q) ||
          j.hostProfile.province?.toLowerCase().includes(q) ||
          j.location?.toLowerCase().includes(q) ||
          j.title.toLowerCase().includes(q),
      );
    }

    // Apply tab sort/filter
    if (filterTab === 'location') {
      // Sort alphabetically by city
      result = [...result].sort((a, b) =>
        (a.hostProfile.city ?? '').localeCompare(b.hostProfile.city ?? ''),
      );
    } else if (filterTab === 'date') {
      // Sort by most recent startDate first; fall back to createdAt
      result = [...result].sort((a, b) => {
        const da = a.startDate ?? a.createdAt;
        const db = b.startDate ?? b.createdAt;
        return new Date(db).getTime() - new Date(da).getTime();
      });
    }
    // 'all' keeps the server order (createdAt desc from the backend)

    return result;
  }, [jobs, filterTab, locationSearch]);

  // Keep selectedId in sync when filteredJobs changes
  useEffect(() => {
    if (
      filteredJobs.length > 0 &&
      !filteredJobs.find((j) => j.id === selectedId)
    ) {
      setSelectedId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedId]);

  const job = filteredJobs.find((j) => j.id === selectedId) ?? null;

  const canApply = isCpsnsVerified(profile?.cpsnsNumber);

  async function handleApply(jobId: string) {
    if (applied.has(jobId)) return;
    if (!canApply) {
      setApplyError(
        'Your CPSNS number must be verified before you can apply. Complete your profile and use a CPSNS on the verified list.',
      );
      return;
    }
    setApplying(jobId);
    setApplyError('');
    try {
      await locumApi.applyToJob(jobId);
      setApplied((prev) => new Set([...prev, jobId]));
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Failed to apply. Please try again.';
      // If "already applied" treat as success
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
  const applyDisabled = (id: string) =>
    !canApply || isApplied(id) || isApplying(id);

  // ── FIX Issue 12b: use actual profile name ────────────────────────────────
  const displayName = profile?.firstName
    ? `Dr ${profile.firstName}${profile.lastName ? ` ${profile.lastName}` : ''}`
    : 'Doctor';

  return (
    <DashLayout
      navItems={NAV}
      activeHref="/locum/browse"
      topbarFirstName={profile?.firstName}
      topbarLastName={profile?.lastName}
    >
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
            }}
          >
            Welcome {displayName}
          </h1>
          <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 14 }}>
            Define and manage organizational, hierarchy, departments, and relationships with AI-powered insights
          </p>

          {!canApply && profile && (
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
              <strong>CPSNS verification required.</strong> Only locums whose
              CPSNS number is on the verified list can apply. Update your CPSNS
              on your{' '}
              <a
                href="/locum/profile"
                style={{ color: '#1d4ed8', fontWeight: 600 }}
              >
                profile
              </a>{' '}
              if needed.
            </div>
          )}

          {/* ── FIX Issue 11: filter controls ──────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'location', 'date'] as const).map((t) => {
            // Compute count per tab for the badge
            const count =
              t === 'all'
                ? jobs.length
                : t === 'location'
                  ? jobs.length // location tab just re-sorts, same total
                  : jobs.length; // date tab also re-sorts

            return (
              <button
                key={t}
                onClick={() => setFilterTab(t)}
                style={{
                  padding: '7px 14px',
                  border: `1px solid ${filterTab === t ? '#0f1523' : '#e2e5ee'}`,
                  borderRadius: '6px 6px 0 0',
                  background: filterTab === t ? '#fff' : '#F1F3F7',
                  fontSize: 12,
                  fontWeight: filterTab === t ? 600 : 400,
                  color: filterTab === t ? '#0f1523' : '#8892a4',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t === 'all'
                  ? `All (${count})`
                  : t === 'location'
                    ? 'By Location'
                    : 'By Date'}
              </button>
            );
          })}
        </div>

        {/* Location / keyword search — shown for all tabs */}
        <input
          type="text"
          value={locationSearch}
          onChange={(e) => setLocationSearch(e.target.value)}
          placeholder="Search by city, province, or title…"
          style={{
            height: 34,
            padding: '4px 10px',
            border: '1px solid #e2e5ee',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
            color: '#0f1523',
            minWidth: 220,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#3B4FD8')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e5ee')}
        />

        {locationSearch && (
          <button
            type="button"
            onClick={() => setLocationSearch('')}
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

        {/* Result count when filtering */}
            {(locationSearch || filterTab !== 'all') && (
              <span style={{ fontSize: 11, color: '#8892a4' }}>
                Showing {filteredJobs.length} of {jobs.length}
              </span>
            )}
          </div>
        </div>

        {/* Split panel: fills remaining viewport height; columns scroll inside */}
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
          {/* Left: job list */}
          <div
            style={{
              width: 250,
              flexShrink: 0,
              minHeight: 0,
              borderRight: '1px solid #e2e5ee',
              overflowY: 'auto',
            }}
          >
          <div
            style={{ padding: '12px 14px', borderBottom: '1px solid #e2e5ee' }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#0f1523',
                marginBottom: 2,
              }}
            >
              {filterTab === 'all'
                ? 'Top Picks for you'
                : filterTab === 'location'
                  ? 'By Location'
                  : 'Most Recent'}
            </div>
            <div style={{ fontSize: 11, color: '#8892a4' }}>
              Based on your profile and location
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
              {locationSearch
                ? `No jobs matching "${locationSearch}".`
                : 'No jobs available right now.'}
            </div>
          )}

          {!loading &&
            filteredJobs.map((j) => (
              <div
                key={j.id}
                onClick={() => setSelectedId(j.id)}
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  background: selectedId === j.id ? '#eef0fb' : '#fff',
                  position: 'relative',
                }}
              >
                {selectedId === j.id && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: '#3B4FD8',
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
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#3B4FD8',
                      lineHeight: 1.3,
                    }}
                  >
                    {j.title.length > 38 ? j.title.slice(0, 38) + '…' : j.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#8892a4',
                      flexShrink: 0,
                      marginLeft: 6,
                    }}
                  >
                    {daysAgo(j.createdAt)}d ago
                  </span>
                </div>
                <div
                  style={{ fontSize: 11, color: '#5a6478', marginBottom: 4 }}
                >
                  {j.hostProfile.city}, {j.hostProfile.province}
                </div>
                {(j.startDate || j.endDate) && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#8892a4',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Image
                      src="/calender.png"
                      alt=""
                      width={12}
                      height={12}
                      style={{ flexShrink: 0, objectFit: 'contain' }}
                    />
                    {fmtDate(j.startDate)} – {fmtDate(j.endDate)}
                  </div>
                )}
                {/* ── Show applied badge in list too ── */}
                {isApplied(j.id) && (
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 4,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: '#d1fae5',
                      color: '#065f46',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    ✓ Applied
                  </span>
                )}
              </div>
            ))}
        </div>

          {/* Right: detail */}
          {job ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '18px 20px',
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 3,
              }}
            >
              <span
                style={
                  {
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: 18,
                    lineHeight: '100%',
                    letterSpacing: 0,
                    verticalAlign: 'middle',
                    color: '#0f1523',
                    leadingTrim: 'none',
                  } as React.CSSProperties
                }
              >
                {job.hostProfile.practiceName}
              </span>
              <Image
                src="/clinic-verified.png"
                alt=""
                width={18}
                height={18}
                style={{
                  flexShrink: 0,
                  objectFit: 'contain',
                  verticalAlign: 'middle',
                }}
              />
            </div>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: '#0f1523',
                marginBottom: 4,
              }}
            >
              {job.title}
            </h2>
            <p style={{ fontSize: 12, color: '#5a6478', marginBottom: 12 }}>
              {job.hostProfile.city}, {job.hostProfile.province} ·{' '}
              {relativeHoursOrDaysAgo(job.createdAt)} · {job.applicationsCount}{' '}
              applicant{job.applicationsCount !== 1 ? 's' : ''}
            </p>

            {/* Date/time/rate badges */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              {(job.startDate || job.endDate) && (
                <span
                  style={{
                    background: '#F1F3F7',
                    padding: '5px 10px',
                    borderRadius: 5,
                    fontSize: 12,
                    color: '#5a6478',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Image
                    src="/calender.png"
                    alt=""
                    width={14}
                    height={14}
                    style={{ flexShrink: 0, objectFit: 'contain' }}
                  />
                  {fmtDate(job.startDate)} – {fmtDate(job.endDate)}
                </span>
              )}
              {(job.startTime || job.endTime) && (
                <span
                  style={{
                    background: '#F1F3F7',
                    padding: '5px 10px',
                    borderRadius: 5,
                    fontSize: 12,
                    color: '#5a6478',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Image
                    src="/clock.png"
                    alt=""
                    width={14}
                    height={14}
                    style={{ flexShrink: 0, objectFit: 'contain' }}
                  />
                  {fmtTime(job.startTime)} – {fmtTime(job.endTime)}
                </span>
              )}
              {job.payPerDay && (
                <span
                  style={{
                    background: '#F0FDF4',
                    padding: '5px 10px',
                    borderRadius: 5,
                    fontSize: 12,
                    color: '#166534',
                    fontWeight: 600,
                  }}
                >
                  ${Number(job.payPerDay).toLocaleString()}/day
                </span>
              )}
              {job.isRural && (
                <span
                  style={{
                    background: '#FFF7ED',
                    padding: '5px 10px',
                    borderRadius: 5,
                    fontSize: 12,
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
                    fontSize: 12,
                    color: '#1e40af',
                  }}
                >
                  🏠 Accommodation
                </span>
              )}
            </div>

            {/* Apply */}
            {applyError && (
              <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
                {applyError}
              </p>
            )}
            <button
              onClick={() => handleApply(job.id)}
              disabled={applyDisabled(job.id)}
              style={{
                padding: '9px 22px',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: applyDisabled(job.id) && !isApplying(job.id)
                  ? 'not-allowed'
                  : isApplied(job.id)
                    ? 'default'
                    : 'pointer',
                marginBottom: 18,
                background: isApplied(job.id)
                  ? '#d0d4e4'
                  : isApplying(job.id)
                    ? '#9CA3AF'
                    : !canApply
                      ? '#e5e7eb'
                      : '#3B4FD8',
                color: isApplied(job.id)
                  ? '#5a6478'
                  : !canApply
                    ? '#9ca3af'
                    : '#fff',
              }}
            >
              {isApplying(job.id)
                ? 'Applying…'
                : isApplied(job.id)
                  ? '✓ Applied'
                  : !canApply
                    ? 'Verify CPSNS to apply'
                    : 'Apply ›'}
            </button>

            {/* About */}
            {(job.description || job.hostProfile.highlights) && (
              <>
                <h4
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#0f1523',
                    marginBottom: 6,
                  }}
                >
                  About the Job
                </h4>
                <p
                  style={{
                    fontSize: 12,
                    color: '#5a6478',
                    lineHeight: 1.7,
                    marginBottom: 14,
                  }}
                >
                  {job.description || job.hostProfile.highlights}
                </p>
              </>
            )}

            {/* Requirements */}
            {(job.requiredCredentials.length > 0 || job.minYearsExperience) && (
              <>
                <h4
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
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
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#374151',
                        marginBottom: 5,
                      }}
                    >
                      Required Credentials
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {job.requiredCredentials.map((s) => (
                        <span
                          key={s}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 20,
                            border: '1px solid #e2e5ee',
                            fontSize: 12,
                            color: '#374151',
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {job.minYearsExperience && (
                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#374151',
                        marginBottom: 4,
                      }}
                    >
                      Preferred Experience
                    </div>
                    <div style={{ fontSize: 12, color: '#5a6478' }}>
                      {job.minYearsExperience}+ Years
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Key responsibilities */}
            {job.keyResponsibilities.length > 0 && (
              <>
                <h4
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#0f1523',
                    marginBottom: 6,
                  }}
                >
                  Key Responsibilities
                </h4>
                <ul style={{ paddingLeft: 16, marginBottom: 14 }}>
                  {job.keyResponsibilities.map((r, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12,
                        color: '#5a6478',
                        lineHeight: 1.7,
                        marginBottom: 3,
                      }}
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* About clinic */}
            <h4
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#0f1523',
                marginBottom: 8,
              }}
            >
              About {job.hostProfile.practiceName}
            </h4>
            <div
              style={{
                fontSize: 12,
                color: '#5a6478',
                lineHeight: 1.8,
                marginBottom: 12,
              }}
            >
              {job.hostProfile.address && (
                <>
                  <strong style={{ color: '#374151' }}>Location:</strong>{' '}
                  {job.hostProfile.address}
                  <br />
                </>
              )}
              {job.hostProfile.practiceType && (
                <>
                  <strong style={{ color: '#374151' }}>Practice Type:</strong>{' '}
                  {job.hostProfile.practiceType}
                  <br />
                </>
              )}
              {job.hostProfile.emr && (
                <>
                  <strong style={{ color: '#374151' }}>EMR System:</strong>{' '}
                  {job.hostProfile.emr}
                  <br />
                </>
              )}
            </div>

            {/* Amenities */}
            {job.hostProfile.servicesOffered.length > 0 && (
              <>
                <h4
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
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
                    marginBottom: 18,
                  }}
                >
                  {job.hostProfile.servicesOffered.map((a) => (
                    <span
                      key={a}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        border: '1px solid #e2e5ee',
                        fontSize: 12,
                        color: '#374151',
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Second apply button */}
            <button
              onClick={() => handleApply(job.id)}
              disabled={applyDisabled(job.id)}
              style={{
                padding: '9px 22px',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: applyDisabled(job.id) && !isApplying(job.id)
                  ? 'not-allowed'
                  : isApplied(job.id)
                    ? 'default'
                    : 'pointer',
                background: isApplied(job.id)
                  ? '#d0d4e4'
                  : isApplying(job.id)
                    ? '#9CA3AF'
                    : !canApply
                      ? '#e5e7eb'
                      : '#3B4FD8',
                color: isApplied(job.id)
                  ? '#5a6478'
                  : !canApply
                    ? '#9ca3af'
                    : '#fff',
              }}
            >
              {isApplying(job.id)
                ? 'Applying…'
                : isApplied(job.id)
                  ? '✓ Applied'
                  : !canApply
                    ? 'Verify CPSNS to apply'
                    : 'Apply ›'}
            </button>
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
                fontSize: 13,
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
    </DashLayout>
  );
}
