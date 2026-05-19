'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, TrendingUp, Users } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson } from '@/lib/adminApi';

type AnalyticsSummary = {
  totalApplications: number;
  fillRatePct: number;
  activeUsers30d: number;
  growth: { month: string; locums: number; hosts: number; total: number }[];
  locations: { name: string; pct: number; count: number }[];
  postingPerformance: {
    filledWithin48hPct: number;
    stillOpenPct: number;
  };
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void adminFetchJson<AnalyticsSummary>('/api/admin/analytics/summary')
      .then((summary) => {
        if (!cancelled) setData(summary);
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Failed to load analytics');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const growth = data?.growth ?? [];
  const maxGrowth = Math.max(
    1,
    ...growth.flatMap((g) => [g.locums, g.hosts, g.total]),
  );

  return (
    <AdminLayout>
      <div className="header-with-actions">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Analytics &amp; Reports</h1>
          <p className="page-description">
            {loading ? 'Loading live metrics…' : 'From your database'}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-primary" disabled>
            <Download size={16} />
            Export Report
          </button>
        </div>
      </div>

      {err ? <div className="error-banner">{err}</div> : null}

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-header">
            <div>
              <p className="metric-label">Total Applications</p>
              <p className="metric-value">
                {loading ? '—' : data?.totalApplications ?? 0}
              </p>
            </div>
            <div className="metric-icon">
              <FileText size={24} color="#4f46e5" />
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div>
              <p className="metric-label">Confirmed fill rate</p>
              <p className="metric-value">
                {loading ? '—' : `${data?.fillRatePct ?? 0}%`}
              </p>
            </div>
            <div className="metric-icon">
              <TrendingUp size={24} color="#4f46e5" />
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div>
              <p className="metric-label">New users (30d)</p>
              <p className="metric-value">
                {loading ? '—' : data?.activeUsers30d ?? 0}
              </p>
            </div>
            <div className="metric-icon">
              <Users size={24} color="#4f46e5" />
            </div>
          </div>
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

      <div className="grid-2">
        <div className="card">
          <h3 className="font-medium mb-4">Posting status</h3>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              <div className="progress-container">
                <div className="progress-header">
                  <span className="progress-label">Non-active postings</span>
                  <span className="progress-value">
                    {data?.postingPerformance.filledWithin48hPct ?? 0}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill progress-blue"
                    style={{
                      width: `${data?.postingPerformance.filledWithin48hPct ?? 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="progress-container">
                <div className="progress-header">
                  <span className="progress-label">Active postings</span>
                  <span className="progress-value">
                    {data?.postingPerformance.stillOpenPct ?? 0}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill progress-amber"
                    style={{
                      width: `${data?.postingPerformance.stillOpenPct ?? 0}%`,
                    }}
                  />
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
      </div>
    </AdminLayout>
  );
}
