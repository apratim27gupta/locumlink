'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  TrendingUp,
  Users,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminDownloadAnalyticsReport, adminFetchJson } from '@/lib/adminApi';
import type { AnalyticsSummary } from '@/lib/adminAnalyticsSummary';
import type {
  AdminApplicationItem,
  AdminJobListItem,
} from '@/lib/adminMarketplace';

type JobDetailResponse = {
  job: AdminJobListItem & {
    description: string;
    servicesRequired: string[];
    requiredSpecialty: string | null;
    minYearsExperience: number | null;
  };
  applications: AdminApplicationItem[];
};

type Preset = '30d' | '90d' | 'all' | 'custom';

function MetricCard({
  label,
  value,
  meaning,
  icon,
}: {
  label: string;
  value: string;
  meaning: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <div>
          <p className="metric-label">{label}</p>
          <p className="metric-value">{value}</p>
          <p className="metric-subtext">{meaning}</p>
        </div>
        <div className="metric-icon">{icon}</div>
      </div>
    </div>
  );
}

function ProfileLink({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/admin/users?userId=${encodeURIComponent(userId)}`}
      className="admin-profile-link"
      title="Open profile"
    >
      {children}
    </Link>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function scheduleLabel(job: {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  fullHalfDay: string | null;
}): string {
  const dates =
    job.startDate || job.endDate
      ? `${job.startDate ?? '?'} → ${job.endDate ?? '?'}`
      : 'No dates';
  const times =
    job.startTime || job.endTime
      ? ` · ${job.startTime ?? '?'}–${job.endTime ?? '?'}`
      : '';
  const half = job.fullHalfDay ? ` · ${job.fullHalfDay}` : '';
  return `${dates}${times}${half}`;
}

export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [jobStatus, setJobStatus] = useState('all');
  const [appStatus, setAppStatus] = useState('all');
  const [jobQ, setJobQ] = useState('');
  const [appQ, setAppQ] = useState('');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [jobs, setJobs] = useState<AdminJobListItem[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [applications, setApplications] = useState<AdminApplicationItem[]>([]);
  const [appsTotal, setAppsTotal] = useState(0);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetailResponse | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rangeQuery = useMemo(() => {
    const qs: Record<string, string> = { preset };
    if (preset === 'custom') {
      if (dateFrom) qs.dateFrom = dateFrom;
      if (dateTo) qs.dateTo = dateTo;
    }
    return qs;
  }, [preset, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = new URLSearchParams(rangeQuery);
      const jobsQs = new URLSearchParams(base);
      jobsQs.set('page', '1');
      jobsQs.set('pageSize', '50');
      if (jobStatus !== 'all') jobsQs.set('status', jobStatus);
      if (jobQ.trim()) jobsQs.set('q', jobQ.trim());

      const appsQs = new URLSearchParams(base);
      appsQs.set('page', '1');
      appsQs.set('pageSize', '50');
      if (appStatus !== 'all') appsQs.set('status', appStatus);
      if (appQ.trim()) appsQs.set('q', appQ.trim());

      const [summary, jobsRes, appsRes] = await Promise.all([
        adminFetchJson<AnalyticsSummary>(
          `/api/admin/analytics/summary?${base.toString()}`,
        ),
        adminFetchJson<{ items: AdminJobListItem[]; total: number }>(
          `/api/admin/jobs?${jobsQs.toString()}`,
        ),
        adminFetchJson<{ items: AdminApplicationItem[]; total: number }>(
          `/api/admin/applications?${appsQs.toString()}`,
        ),
      ]);
      setData(summary);
      setJobs(jobsRes.items ?? []);
      setJobsTotal(jobsRes.total ?? 0);
      setApplications(appsRes.items ?? []);
      setAppsTotal(appsRes.total ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load analytics');
      setData(null);
      setJobs([]);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [rangeQuery, jobStatus, appStatus, jobQ, appQ]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleJob(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      setJobDetail(null);
      return;
    }
    setExpandedJobId(jobId);
    setJobDetail(null);
    setJobDetailLoading(true);
    try {
      const detail = await adminFetchJson<JobDetailResponse>(
        `/api/admin/jobs/${encodeURIComponent(jobId)}`,
      );
      setJobDetail(detail);
      const el = document.getElementById('admin-jobs-section');
      if (el && !jobs.some((j) => j.id === jobId)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load job detail');
      setExpandedJobId(null);
    } finally {
      setJobDetailLoading(false);
    }
  }

  async function handleExport() {
    if (exporting || loading || !data) return;
    setExporting(true);
    setErr(null);
    try {
      await adminDownloadAnalyticsReport(rangeQuery);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const growth = data?.growth ?? [];
  const maxGrowth = Math.max(
    1,
    ...growth.flatMap((g) => [g.locums, g.hosts, g.total]),
  );
  const byStatus = data?.applicationsByStatus;
  const postings = data?.postingsByStatus;

  return (
    <AdminLayout>
      <div className="header-with-actions">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Analytics &amp; Reports</h1>
          <p className="page-description">
            {loading
              ? 'Loading live metrics…'
              : `Marketplace insights · ${data?.period.label ?? ''}`}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || exporting || !data}
            onClick={() => void handleExport()}
          >
            <Download size={16} />
            {exporting ? 'Exporting…' : 'Export Report'}
          </button>
        </div>
      </div>

      <div className="filter-grid" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="analytics-preset">
            Period
          </label>
          <select
            id="analytics-preset"
            className="form-select"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        {preset === 'custom' ? (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="analytics-from">
                From
              </label>
              <input
                id="analytics-from"
                type="date"
                className="form-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="analytics-to">
                To
              </label>
              <input
                id="analytics-to"
                type="date"
                className="form-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>

      {err ? <div className="error-banner">{err}</div> : null}

      <div className="metric-grid">
        <MetricCard
          label="Total applications"
          value={loading ? '—' : String(data?.totalApplications ?? 0)}
          meaning="All locum applications in the selected period"
          icon={<FileText size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Host confirm rate"
          value={loading ? '—' : `${data?.hostConfirmRatePct ?? 0}%`}
          meaning="Confirmed applications ÷ total applications"
          icon={<TrendingUp size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Locum accept rate"
          value={loading ? '—' : `${data?.locumAcceptRatePct ?? 0}%`}
          meaning="Accepted placements ÷ confirmed applications"
          icon={<TrendingUp size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Suitable locum found"
          value={loading ? '—' : `${data?.suitableLocumFoundPct ?? 0}%`}
          meaning="Postings that reached Ongoing/Completed among finished postings"
          icon={<TrendingUp size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Posted jobs"
          value={loading ? '—' : String(data?.postedJobsCount ?? 0)}
          meaning="Non-draft postings created in the selected period"
          icon={<FileText size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="New users"
          value={loading ? '—' : String(data?.newUsersInPeriod ?? 0)}
          meaning="Host and locum sign-ups in the selected period"
          icon={<Users size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Avg time to confirm"
          value={
            loading
              ? '—'
              : data?.avgHoursToConfirm != null
                ? `${data.avgHoursToConfirm}h`
                : '—'
          }
          meaning="Average hours from apply → host confirm"
          icon={<TrendingUp size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Avg time to accept"
          value={
            loading
              ? '—'
              : data?.avgHoursToAccept != null
                ? `${data.avgHoursToAccept}h`
                : '—'
          }
          meaning="Average hours from host confirm → locum accept"
          icon={<TrendingUp size={24} color="#4f46e5" />}
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3 className="font-medium mb-4">Application pipeline</h3>
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Where candidates sit after applying in this period.
          </p>
          {loading || !byStatus ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <div className="pipeline-grid">
              {(
                [
                  ['Applied', byStatus.applied, 'Waiting for host action'],
                  ['Shortlisted', byStatus.shortlisted, 'Host selected / shortlisted'],
                  ['Confirmed', byStatus.confirmed, 'Host offered the placement'],
                  ['Accepted', data?.acceptedCount ?? 0, 'Locum accepted (shift filled)'],
                  ['Rejected', byStatus.rejected, 'Host rejected'],
                  ['Withdrawn', byStatus.withdrawn, 'Locum withdrew or declined'],
                ] as const
              ).map(([label, count, hint]) => (
                <div key={label} className="pipeline-item">
                  <div className="pipeline-count">{count}</div>
                  <div className="pipeline-label">{label}</div>
                  <div className="pipeline-hint">{hint}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-medium mb-4">Job outcomes</h3>
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Posting status for jobs created in this period.
          </p>
          {loading || !postings ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <div className="pipeline-grid">
              {(
                [
                  ['Active', postings.active, 'Open for applicants'],
                  ['Ongoing', postings.ongoing, 'Locum accepted; in progress'],
                  ['Completed', postings.completed, 'Finished with an accepted locum'],
                  ['Expired', postings.expired, 'Ended without fill'],
                  ['Cancelled', postings.cancelled, 'Host cancelled'],
                  [
                    'Unfilled expired',
                    data?.unfilledExpiredCount ?? 0,
                    'Expired with no accepted locum',
                  ],
                ] as const
              ).map(([label, count, hint]) => (
                <div key={label} className="pipeline-item">
                  <div className="pipeline-count">{count}</div>
                  <div className="pipeline-label">{label}</div>
                  <div className="pipeline-hint">{hint}</div>
                </div>
              ))}
            </div>
          )}
          {!loading && data ? (
            <p className="text-sm text-muted" style={{ marginTop: 12 }}>
              Placements confirmed within 48h of apply:{' '}
              <strong>{data.postingPerformance.filledWithin48hPct}%</strong>
            </p>
          ) : null}
        </div>
      </div>

      <div className="card mb-6" id="admin-jobs-section">
        <div className="header-with-actions" style={{ marginBottom: 12 }}>
          <div>
            <h3 className="font-medium">Posted jobs</h3>
            <p className="text-sm text-muted">
              Who posted, schedule, and applicant funnel. Expand a row for
              candidates. Names open profiles.
              {!loading ? ` · ${jobsTotal} total` : ''}
            </p>
          </div>
        </div>
        {expandedJobId
        && jobDetail
        && !jobs.some((j) => j.id === expandedJobId)
        && jobDetail.job.id === expandedJobId ? (
          <div className="job-detail-panel" style={{ marginBottom: 16 }}>
            <p className="font-medium">{jobDetail.job.title}</p>
            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
              Host:{' '}
              <ProfileLink userId={jobDetail.job.host.userId}>
                {jobDetail.job.host.practiceName}
              </ProfileLink>
              {' · '}
              {jobDetail.applications.length} applicant(s)
            </p>
            {jobDetail.applications.length === 0 ? (
              <p className="text-sm text-muted">No applicants yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Status</th>
                    <th>Locum response</th>
                    <th>Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {jobDetail.applications.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <ProfileLink userId={a.locum.userId}>{a.locum.name}</ProfileLink>
                      </td>
                      <td>{a.status}</td>
                      <td>{a.locumResponse ?? '—'}</td>
                      <td>{fmtDate(a.appliedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
        <div className="filter-grid" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="job-status">
              Status
            </label>
            <select
              id="job-status"
              className="form-select"
              value={jobStatus}
              onChange={(e) => setJobStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="ACTIVE">Active</option>
              <option value="ONGOING">Ongoing</option>
              <option value="COMPLETED">Completed</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="job-q">
              Search
            </label>
            <input
              id="job-q"
              className="form-input"
              placeholder="Title, host, location…"
              value={jobQ}
              onChange={(e) => setJobQ(e.target.value)}
            />
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th />
                <th>Job</th>
                <th>Host</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Apps</th>
                <th>Selected</th>
                <th>Accepted</th>
                <th>Posted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-muted">
                    Loading…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-muted">
                    No jobs in this period.
                  </td>
                </tr>
              ) : (
                jobs.flatMap((job) => {
                  const rows = [
                    <tr
                      key={job.id}
                      className="table-row-clickable"
                      onClick={() => void toggleJob(job.id)}
                    >
                      <td>
                        {expandedJobId === job.id ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </td>
                      <td>
                        <div className="font-medium">{job.title}</div>
                        <div className="text-sm text-muted">
                          {job.location}
                          {job.isRural ? ' · Rural' : ''}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <ProfileLink userId={job.host.userId}>
                          {job.host.practiceName}
                        </ProfileLink>
                        <div className="text-sm text-muted">
                          {job.host.contactName}
                        </div>
                      </td>
                      <td className="text-sm">{scheduleLabel(job)}</td>
                      <td>
                        <span className="status-badge">{job.status}</span>
                      </td>
                      <td>{job.applicationCount}</td>
                      <td>{job.selectedCount}</td>
                      <td>{job.acceptedCount}</td>
                      <td className="text-sm">{fmtDate(job.createdAt)}</td>
                    </tr>,
                  ];
                  if (expandedJobId === job.id) {
                    rows.push(
                      <tr key={`${job.id}-detail`}>
                        <td colSpan={9}>
                          {jobDetailLoading ? (
                            <p className="text-sm text-muted">Loading applicants…</p>
                          ) : jobDetail && jobDetail.job.id === job.id ? (
                            <div className="job-detail-panel">
                              <p className="text-sm" style={{ marginBottom: 8 }}>
                                {jobDetail.job.description.slice(0, 280)}
                                {jobDetail.job.description.length > 280 ? '…' : ''}
                              </p>
                              <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
                                Leave: {jobDetail.job.leaveType ?? '—'} · Pay/day:{' '}
                                {jobDetail.job.payPerDay ?? '—'} · Specialty:{' '}
                                {jobDetail.job.requiredSpecialty ?? '—'}
                              </p>
                              {jobDetail.applications.length === 0 ? (
                                <p className="text-sm text-muted">No applicants yet.</p>
                              ) : (
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Candidate</th>
                                      <th>Specialty</th>
                                      <th>Status</th>
                                      <th>Locum response</th>
                                      <th>Applied</th>
                                      <th>Confirmed</th>
                                      <th>Accepted</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {jobDetail.applications.map((a) => (
                                      <tr key={a.id}>
                                        <td>
                                          <ProfileLink userId={a.locum.userId}>
                                            {a.locum.name}
                                          </ProfileLink>
                                          <div className="text-sm text-muted">
                                            {a.locum.email}
                                          </div>
                                        </td>
                                        <td className="text-sm">
                                          {a.locum.specialty ?? '—'}
                                          {a.locum.yearsOfExperience != null
                                            ? ` · ${a.locum.yearsOfExperience}y`
                                            : ''}
                                        </td>
                                        <td>
                                          <span className="status-badge">{a.status}</span>
                                        </td>
                                        <td>{a.locumResponse ?? '—'}</td>
                                        <td className="text-sm">{fmtDate(a.appliedAt)}</td>
                                        <td className="text-sm">{fmtDate(a.placedAt)}</td>
                                        <td className="text-sm">
                                          {fmtDate(a.locumAcceptedAt)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted">Could not load detail.</p>
                          )}
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-6">
        <div className="header-with-actions" style={{ marginBottom: 12 }}>
          <div>
            <h3 className="font-medium">Applications</h3>
            <p className="text-sm text-muted">
              All applications in the period. Click a name to open the admin
              profile.
              {!loading ? ` · ${appsTotal} total` : ''}
            </p>
          </div>
        </div>
        <div className="filter-grid" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="app-status">
              Status
            </label>
            <select
              id="app-status"
              className="form-select"
              value={appStatus}
              onChange={(e) => setAppStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="APPLIED">Applied</option>
              <option value="SHORTLISTED">Shortlisted</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="REJECTED">Rejected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="app-q">
              Search
            </label>
            <input
              id="app-q"
              className="form-input"
              placeholder="Candidate, job, host…"
              value={appQ}
              onChange={(e) => setAppQ(e.target.value)}
            />
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Host</th>
                <th>Status</th>
                <th>Locum response</th>
                <th>Applied</th>
                <th>Confirmed</th>
                <th>Accepted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-muted">
                    Loading…
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-muted">
                    No applications in this period.
                  </td>
                </tr>
              ) : (
                applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <ProfileLink userId={a.locum.userId}>{a.locum.name}</ProfileLink>
                      <div className="text-sm text-muted">{a.locum.email}</div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-profile-link"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onClick={() => void toggleJob(a.job.id)}
                      >
                        {a.job.title}
                      </button>
                      <div className="text-sm text-muted">{a.job.location}</div>
                    </td>
                    <td>
                      <ProfileLink userId={a.host.userId}>
                        {a.host.practiceName}
                      </ProfileLink>
                    </td>
                    <td>
                      <span className="status-badge">{a.status}</span>
                    </td>
                    <td>{a.locumResponse ?? '—'}</td>
                    <td className="text-sm">{fmtDate(a.appliedAt)}</td>
                    <td className="text-sm">{fmtDate(a.placedAt)}</td>
                    <td className="text-sm">{fmtDate(a.locumAcceptedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-medium mb-4">User sign-ups (last 5 months)</h3>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : growth.length === 0 ? (
          <p className="text-sm text-muted">No sign-ups in this period.</p>
        ) : (
          <>
            <div className="chart-container">
              {growth.map((g) => (
                <div key={g.month} className="chart-bar">
                  <div className="chart-bars">
                    <div
                      className="chart-bar-locums"
                      style={{ height: Math.round((g.locums / maxGrowth) * 160) }}
                    />
                    <div
                      className="chart-bar-hosts"
                      style={{ height: Math.round((g.hosts / maxGrowth) * 160) }}
                    />
                  </div>
                  <div>
                    <p className="chart-month">{g.month}</p>
                    <p className="chart-total">{g.total}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#6366f1' }} />
                <span className="legend-label">Locums</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#c7d2fe' }} />
                <span className="legend-label">Hosts</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="font-medium mb-4">Top host cities</h3>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (data?.locations.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No host locations yet.</p>
        ) : (
          data?.locations.map((loc) => (
            <div key={loc.name} className="location-item">
              <span className="location-name">{loc.name}</span>
              <div className="location-bar">
                <div className="location-fill" style={{ width: `${loc.pct}%` }} />
              </div>
              <span className="location-count">{loc.count}</span>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
