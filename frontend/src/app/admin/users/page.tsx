'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, Download, Search, UserCheck, XCircle } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson, adminDownloadUsersCsv } from '@/lib/adminApi';

type Row = {
  id: string;
  email: string;
  role: 'LOCUM' | 'HOST' | 'ADMIN';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: string;
  lastLoginAt: string | null;
};

function roleLabel(role: Row['role']): string {
  if (role === 'HOST') return 'Host Physician';
  if (role === 'LOCUM') return 'Locum Physician';
  return 'Admin';
}

function statusClass(status: Row['status']): string {
  if (status === 'ACTIVE') return 'status-active';
  if (status === 'PENDING') return 'status-pending';
  if (status === 'SUSPENDED' || status === 'DEACTIVATED') return 'status-suspended';
  return 'status-pending';
}

function statusLabel(status: Row['status']): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'PENDING') return 'Pending';
  if (status === 'SUSPENDED') return 'Suspended';
  return 'Deactivated';
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Row | null>(null);
  const [suspensionNote, setSuspensionNote] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ page: '1', pageSize: '100' });
      if (debouncedQ.trim()) qs.set('q', debouncedQ.trim());
      const data = await adminFetchJson<{ users: Row[] }>(
        `/api/admin/users?${qs.toString()}`,
      );
      setRows(data.users ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchUser(
    id: string,
    patch: { status: Row['status']; suspensionNote?: string },
  ) {
    setSavingId(id);
    setErr(null);
    try {
      await adminFetchJson(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setSuspendTarget(null);
      setSuspensionNote('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSavingId(null);
    }
  }

  function openSuspendModal(row: Row) {
    setSuspendTarget(row);
    setSuspensionNote('');
    setErr(null);
  }

  function closeSuspendModal() {
    setSuspendTarget(null);
    setSuspensionNote('');
  }

  async function confirmSuspend() {
    if (!suspendTarget) return;
    const note = suspensionNote.trim();
    if (!note) {
      setErr('Enter a suspension note before suspending this user.');
      return;
    }
    await patchUser(suspendTarget.id, {
      status: 'SUSPENDED',
      suspensionNote: note,
    });
  }

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    if (t && !r.email.toLowerCase().includes(t)) return false;
    if (roleFilter === 'host' && r.role !== 'HOST') return false;
    if (roleFilter === 'locum' && r.role !== 'LOCUM') return false;
    if (statusFilter !== 'all' && r.status.toLowerCase() !== statusFilter) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="header-with-actions">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">View, suspend, and reinstate user accounts</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => adminDownloadUsersCsv(debouncedQ).catch((e) => setErr(String(e)))}
          >
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
            placeholder="Search by name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="host">Host Physicians</option>
          <option value="locum">Locum Physicians</option>
        </select>
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-medium">{r.email.split('@')[0]}</div>
                    <div className="text-sm text-muted">{r.email}</div>
                  </td>
                  <td className="text-muted">{roleLabel(r.role)}</td>
                  <td>
                    <span className={`status-badge ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="text-muted">{fmtDate(r.createdAt)}</td>
                  <td className="text-muted">
                    {r.lastLoginAt ? fmtDate(r.lastLoginAt) : '—'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      {r.status === 'SUSPENDED' || r.status === 'DEACTIVATED' ? (
                        <button
                          type="button"
                          className="icon-btn icon-btn-success"
                          disabled={savingId === r.id}
                          title="Reinstate"
                          onClick={() => patchUser(r.id, { status: 'ACTIVE' })}
                        >
                          <UserCheck size={16} color="#059669" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          disabled={savingId === r.id || r.role === 'ADMIN'}
                          title="Suspend"
                          onClick={() => openSuspendModal(r)}
                        >
                          <Ban size={16} color="#dc2626" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        className={`modal-overlay${suspendTarget ? ' active' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeSuspendModal();
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        {suspendTarget ? (
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Suspend user</h2>
                <p className="modal-subtitle">{suspendTarget.email}</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeSuspendModal}
                aria-label="Close"
                disabled={savingId === suspendTarget.id}
              >
                <XCircle size={20} color="#64748b" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                This account will be blocked from signing in until you reinstate it.
                A suspension note is required for the audit log.
              </p>
              <div className="form-group">
                <label className="form-label" htmlFor="suspension-note">
                  Suspension note (required)
                </label>
                <textarea
                  id="suspension-note"
                  className="input"
                  placeholder="e.g. Policy violation, duplicate account, requested by user…"
                  value={suspensionNote}
                  onChange={(e) => setSuspensionNote(e.target.value)}
                  rows={4}
                  disabled={savingId === suspendTarget.id}
                />
              </div>
              <div className="grid-2" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: 12 }}
                  disabled={savingId === suspendTarget.id}
                  onClick={closeSuspendModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    padding: 12,
                    borderColor: '#fecaca',
                    color: '#dc2626',
                  }}
                  disabled={savingId === suspendTarget.id || !suspensionNote.trim()}
                  onClick={() => void confirmSuspend()}
                >
                  <Ban size={18} />
                  {savingId === suspendTarget.id ? 'Suspending…' : 'Confirm suspend'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
