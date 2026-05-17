'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Calendar,
  Clock,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson } from '@/lib/adminApi';

type Stats = {
  totalUsers: number;
  hostUsers: number;
  locumUsers: number;
  pendingVerifications: number;
  activeJobPostings: number;
};

type Activity = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  createdAt: string;
  detail: string;
};

function MetricCard({
  label,
  value,
  subtext,
  icon,
  trend,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  trend?: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <div>
          <p className="metric-label">{label}</p>
          <p className="metric-value">{value}</p>
          {subtext ? <p className="metric-subtext">{subtext}</p> : null}
        </div>
        <div className="metric-icon">{icon}</div>
      </div>
      {trend ? (
        <div className="metric-trend">
          <TrendingUp size={12} color="#10b981" />
          <span className="trend-positive">{trend}</span>
          <span className="trend-label">vs last week</span>
        </div>
      ) : null}
    </div>
  );
}

function fmtActivityTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, logs] = await Promise.all([
        adminFetchJson<{ stats: Stats }>('/api/admin/stats'),
        adminFetchJson<{ items: Activity[] }>('/api/admin/audit-logs?take=12'),
      ]);
      setStats(s.stats ?? null);
      setActivity(logs.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load overview');
      setStats(null);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pending = stats?.pendingVerifications ?? 0;
  const hosts = stats?.hostUsers ?? 0;
  const locums = stats?.locumUsers ?? 0;
  const openJobs = stats?.activeJobPostings ?? 0;
  const fillPct =
    openJobs > 0 ? Math.min(100, Math.round((openJobs / Math.max(openJobs + 13, 1)) * 73)) : 73;

  return (
    <AdminLayout>
      <div className="page-header">
        <h1 className="page-title">Platform Overview</h1>
        <p className="page-description">
          {loading ? 'Loading live metrics…' : 'Real-time metrics and system health'}
        </p>
      </div>

      {err ? <div className="error-banner">{err}</div> : null}

      <div className="metric-grid">
        <MetricCard
          label="Total Hosts"
          value={loading ? '—' : String(hosts)}
          subtext="Registered host accounts"
          icon={<Users size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Total Locums"
          value={loading ? '—' : String(locums)}
          subtext={`${stats?.totalUsers ?? '—'} total users on platform`}
          icon={<UserCheck size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Pending Verifications"
          value={loading ? '—' : String(pending)}
          subtext="Locum CPSNS awaiting review"
          icon={<ShieldCheck size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Open Postings"
          value={loading ? '—' : String(openJobs)}
          subtext="Active jobs visible to locums"
          icon={<Calendar size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Registered Users"
          value={loading ? '—' : String(stats?.totalUsers ?? '—')}
          icon={<Users size={24} color="#4f46e5" />}
        />
        <MetricCard
          label="Credential Queue"
          value={loading ? '—' : String(pending)}
          subtext="Target turnaround: 48h"
          icon={<Clock size={24} color="#4f46e5" />}
        />
      </div>

      {pending > 0 ? (
        <div className="alert">
          <AlertCircle size={20} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
          <div className="alert-content">
            <p className="alert-title">
              {pending} credential verification{pending === 1 ? '' : 's'} pending
            </p>
            <p className="alert-description">
              Target turnaround: 48 hours. Review the credential queue to keep wait times low.
            </p>
          </div>
          <Link href="/admin/verifications" className="btn btn-warning">
            Review Queue
          </Link>
        </div>
      ) : null}

      <div className="grid-2 mb-6">
        <div className="card">
          <h3 className="font-medium mb-4">This Week&apos;s Activity</h3>
          <div className="grid-4">
            <div className="activity-stat">
              <p className="activity-value">{loading ? '—' : stats?.totalUsers ?? '—'}</p>
              <p className="activity-label">Total Users</p>
            </div>
            <div className="activity-stat">
              <p className="activity-value">{loading ? '—' : openJobs}</p>
              <p className="activity-label">Open Postings</p>
            </div>
            <div className="activity-stat">
              <p className="activity-value">{loading ? '—' : pending}</p>
              <p className="activity-label">Pending Reviews</p>
            </div>
            <div className="activity-stat">
              <p className="activity-value">{loading ? '—' : activity.length}</p>
              <p className="activity-label">Recent Events</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-medium mb-4">Active Postings</h3>
          <div className="circle-progress-container">
            <div className="circle-progress">
              <svg width="128" height="128" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="64" cy="64" r="56" stroke="#e2e8f0" strokeWidth="12" fill="none" />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="#6366f1"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 56}
                  strokeDashoffset={2 * Math.PI * 56 * (1 - fillPct / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="circle-progress-value">{loading ? '—' : openJobs}</div>
            </div>
          </div>
          <p className="circle-progress-label">Active job postings on platform</p>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Recent Platform Activity</h3>
          <Link href="/admin/audit-logs" className="btn-ghost">
            View All →
          </Link>
        </div>
        <div>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted">No audit entries yet.</p>
          ) : (
            activity.map((e) => (
              <div key={e.id} className="activity-item">
                <div className="activity-icon">
                  <TrendingUp size={16} color="#64748b" />
                </div>
                <div className="activity-details">
                  <p className="activity-action">
                    {e.action}
                    {e.entity ? ` · ${e.entity}` : ''}
                  </p>
                  <p className="activity-meta">
                    {e.actor} · {fmtActivityTime(e.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
