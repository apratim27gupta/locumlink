'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Download, Search } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson } from '@/lib/adminApi';

type LogRow = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  createdAt: string;
  detail: string;
};

function fmtTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

export default function AdminAuditLogsPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ take: '200' });
      if (debouncedQ.trim()) qs.set('q', debouncedQ.trim());
      const data = await adminFetchJson<{ items: LogRow[] }>(
        `/api/admin/audit-logs?${qs.toString()}`,
      );
      setRows(data.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    const header = ['Timestamp', 'Actor', 'Action', 'Target', 'Detail'];
    const lines = rows.map((r) => [
      fmtTimestamp(r.createdAt),
      r.actor,
      r.action,
      r.entity,
      r.detail,
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="header-with-actions">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-description">
            Complete record of all platform actions and events
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {err ? <div className="error-banner">{err}</div> : null}

      <div className="filter-grid">
        <div className="input-group">
          <Search className="input-icon" size={20} />
          <input
            type="text"
            className="input input-with-icon"
            placeholder="Search audit logs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Outcome</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  No audit rows.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13, color: '#64748b' }}>
                    {fmtTimestamp(r.createdAt)}
                  </td>
                  <td>
                    <div className="font-medium text-sm">{r.actor}</div>
                  </td>
                  <td>
                    <span className="tag">{r.action}</span>
                  </td>
                  <td style={{ color: '#475569' }}>{r.entity}</td>
                  <td>
                    <span className="outcome-success">
                      <CheckCircle size={12} />
                      Success
                    </span>
                  </td>
                  <td className="text-muted">{r.detail || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
