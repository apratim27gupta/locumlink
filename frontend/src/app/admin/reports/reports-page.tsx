'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
  adminActionReport,
  adminGetReport,
  adminListReports,
  type AdminReportDetail,
  type AdminReportRow,
  type AdminReportStatus,
} from '@/lib/adminApi';
import { useAdminStats } from '@/components/AdminStatsContext';

const STATUS_OPTIONS: AdminReportStatus[] = ['OPEN', 'WARNED', 'SUSPENDED', 'DISMISSED'];

function reasonLabel(reason: string): string {
  return reason
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActionModal({
  title,
  label,
  busy,
  destructive,
  onCancel,
  onConfirm,
}: {
  title: string;
  label: string;
  busy: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 440, margin: 0 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{title}</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          placeholder="Add the note visible to the user/admin record"
          style={{
            width: '100%',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            padding: 10,
            fontFamily: 'inherit',
            fontSize: 14,
            resize: 'vertical',
            margin: '12px 0 16px',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'btn-danger' : 'btn-warning'}`}
            disabled={busy || !note.trim()}
            onClick={() => onConfirm(note.trim())}
          >
            {busy ? 'Saving...' : label}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminReportsPage({ initialReportId }: { initialReportId?: string }) {
  const [status, setStatus] = useState<AdminReportStatus>('OPEN');
  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialReportId ?? null);
  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [modal, setModal] = useState<'WARN' | 'SUSPEND' | null>(null);
  const { refresh } = useAdminStats();

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListReports(status);
      setReports(data.items);
      if (!selectedId && data.items[0]) setSelectedId(data.items[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reports');
    } finally {
      setLoading(false);
    }
  }, [selectedId, status]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    adminGetReport(selectedId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load report'))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  );

  async function runAction(action: 'DISMISS' | 'WARN' | 'SUSPEND', note?: string) {
    if (!selectedId) return;
    setActionBusy(true);
    try {
      const updated =
        action === 'WARN'
          ? await adminActionReport(selectedId, { action, warningNote: note ?? '' })
          : action === 'SUSPEND'
            ? await adminActionReport(selectedId, { action, suspensionNote: note ?? '' })
            : await adminActionReport(selectedId, { action });
      setDetail(updated);
      setModal(null);
      await Promise.all([loadReports(), refresh()]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not update report');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-description">
          Review user reports, inspect recent message context, warn users, or suspend accounts.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn ${status === s ? 'btn-primary' : ''}`}
            onClick={() => {
              setStatus(s);
              setSelectedId(null);
            }}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error ? <div className="alert"><div className="alert-description">{error}</div></div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 18, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 20, color: '#64748b' }}>Loading reports...</div>
          ) : reports.length === 0 ? (
            <div style={{ padding: 20, color: '#64748b' }}>No reports in this status.</div>
          ) : (
            reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedId(report.id)}
                style={{
                  width: '100%',
                  padding: 16,
                  textAlign: 'left',
                  background: report.id === selectedId ? '#eef2ff' : '#fff',
                  border: 'none',
                  borderBottom: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{report.reported.name}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  {reasonLabel(report.reason)} · {fmtDate(report.createdAt)}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Reported by {report.reporter.name}
                  {report.alsoBlockedReporter ? ' · also blocked' : ''}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="card">
          {detailLoading ? (
            <div style={{ color: '#64748b' }}>Loading report detail...</div>
          ) : !detail ? (
            <div style={{ color: '#64748b' }}>{selectedReport ? 'Select a report.' : 'No report selected.'}</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{detail.reported.name}</h2>
                  <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                    {detail.reported.email} · {detail.reported.role} · {detail.reported.status}
                  </p>
                </div>
                <span className="status-badge">{detail.status}</span>
              </div>

              <div style={{ marginTop: 18, padding: 14, background: '#f8fafc', borderRadius: 8 }}>
                <div style={{ fontWeight: 700 }}>{reasonLabel(detail.reason)}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  Reported by {detail.reporter.name} on {fmtDate(detail.createdAt)}
                  {detail.alsoBlockedReporter ? ' · reporter also blocked this account' : ''}
                </div>
                {detail.details ? <p style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{detail.details}</p> : null}
              </div>

              <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>Last 5 messages</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {detail.messages.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: 13 }}>No message history found.</div>
                ) : detail.messages.map((msg) => {
                  const sender = msg.senderId === detail.reporter.id ? detail.reporter.name : detail.reported.name;
                  return (
                    <div key={msg.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        {sender} · {fmtDate(msg.sentAt)}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{msg.body || '(attachment only)'}</div>
                      {msg.attachments.length ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                          {msg.attachments.length} attachment{msg.attachments.length === 1 ? '' : 's'}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {detail.status === 'OPEN' ? (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" disabled={actionBusy} onClick={() => void runAction('DISMISS')}>
                    Dismiss
                  </button>
                  <button type="button" className="btn btn-warning" disabled={actionBusy} onClick={() => setModal('WARN')}>
                    Send warning
                  </button>
                  <button type="button" className="btn btn-danger" disabled={actionBusy} onClick={() => setModal('SUSPEND')}>
                    Suspend account
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {modal === 'WARN' ? (
        <ActionModal
          title="Send warning"
          label="Send warning"
          busy={actionBusy}
          onCancel={() => setModal(null)}
          onConfirm={(note) => void runAction('WARN', note)}
        />
      ) : null}
      {modal === 'SUSPEND' ? (
        <ActionModal
          title="Suspend account"
          label="Suspend account"
          destructive
          busy={actionBusy}
          onCancel={() => setModal(null)}
          onConfirm={(note) => void runAction('SUSPEND', note)}
        />
      ) : null}
    </AdminLayout>
  );
}
