'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, Download, Eye, FileText, Search, UserCheck, XCircle } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson, adminDownloadUsersCsv } from '@/lib/adminApi';
import { formatAdminCpsnsDisplay } from '@/lib/cpsnsVerify';

type CpsnsVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';

type Row = {
  id: string;
  email: string;
  role: 'LOCUM' | 'HOST' | 'ADMIN';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DEACTIVATED';
  cpsnsVerificationStatus: CpsnsVerificationStatus | null;
  inCredentialQueue?: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type DisplayStatus = { label: string; className: string };

function roleLabel(role: Row['role']): string {
  if (role === 'HOST') return 'Host Physician';
  if (role === 'LOCUM') return 'Locum Physician';
  return 'Admin';
}

/** Credential + account status for the User Management table. */
function displayStatus(row: Row): DisplayStatus {
  if (row.status === 'SUSPENDED') {
    return { label: 'Suspended', className: 'status-suspended' };
  }
  if (row.status === 'DEACTIVATED') {
    return { label: 'Deactivated', className: 'status-deactivated' };
  }
  if (row.cpsnsVerificationStatus === 'VERIFIED') {
    return { label: 'Verified', className: 'status-verified' };
  }
  if (row.cpsnsVerificationStatus === 'REJECTED') {
    return { label: 'Rejected', className: 'status-rejected' };
  }
  if (row.inCredentialQueue) {
    return { label: 'Under review', className: 'status-under-review' };
  }
  if (row.status === 'PENDING') {
    return { label: 'Setup incomplete', className: 'status-pending' };
  }
  if (row.cpsnsVerificationStatus === 'PENDING_REVIEW') {
    return { label: 'Incomplete profile', className: 'text-muted' };
  }
  if (!row.cpsnsVerificationStatus) {
    return { label: 'No profile', className: 'text-muted' };
  }
  return { label: 'Not submitted', className: 'text-muted' };
}

function matchesStatusFilter(row: Row, filter: string): boolean {
  if (filter === 'all') return true;
  const { label } = displayStatus(row);
  if (filter === 'verified') return label === 'Verified';
  if (filter === 'rejected') return label === 'Rejected';
  if (filter === 'under_review') return label === 'Under review';
  if (filter === 'pending') return label === 'Setup incomplete';
  if (filter === 'suspended') return label === 'Suspended';
  if (filter === 'deactivated') return label === 'Deactivated';
  return true;
}

type UserProfileDocument = {
  id: string;
  label: string;
  fileName: string;
  signedUrl: string;
};

type ProfileField = { label: string; value: string };

type UserProfileDetail = {
  userId: string;
  email: string;
  role: 'LOCUM' | 'HOST';
  profileType: 'locum' | 'host';
  hasProfile: boolean;
  documents: UserProfileDocument[];
  profileFields: ProfileField[];
};

function cpsnsFromProfileFields(fields: ProfileField[]): string {
  const raw = fields.find((f) => f.label === 'CPSNS')?.value;
  return formatAdminCpsnsDisplay(raw);
}

function displayNameFromFields(
  fields: ProfileField[],
  email: string,
): string {
  const first = fields.find((f) => f.label === 'First name')?.value;
  const last = fields.find((f) => f.label === 'Last name')?.value;
  const contact = fields.find((f) => f.label === 'Contact')?.value;
  const clinic = fields.find((f) => f.label === 'Clinic / practice')?.value;
  const fromPerson = [first, last].filter(Boolean).join(' ').trim();
  if (fromPerson) return fromPerson;
  if (contact?.trim()) return contact.trim();
  if (clinic?.trim()) return clinic.trim();
  return email.split('@')[0] ?? email;
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
  const [reinstateTarget, setReinstateTarget] = useState<Row | null>(null);
  const [profileUser, setProfileUser] = useState<Row | null>(null);
  const [profileDetail, setProfileDetail] = useState<UserProfileDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [showProfileFields, setShowProfileFields] = useState(true);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);

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
    setShowSuspendConfirm(false);
  }

  function openReinstateModal(row: Row) {
    setReinstateTarget(row);
    setErr(null);
  }

  function closeReinstateModal() {
    setReinstateTarget(null);
  }

  function closeProfileModal() {
    setProfileUser(null);
    setProfileDetail(null);
    setProfileErr(null);
    setShowProfileFields(true);
  }

  async function openUserProfile(row: Row) {
    if (row.role === 'ADMIN') return;
    setProfileUser(row);
    setProfileDetail(null);
    setProfileErr(null);
    setShowProfileFields(true);
    setProfileLoading(true);
    try {
      const detail = await adminFetchJson<UserProfileDetail>(
        `/api/admin/users/${encodeURIComponent(row.id)}/profile`,
      );
      setProfileDetail(detail);
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : 'Could not load profile');
    } finally {
      setProfileLoading(false);
    }
  }

  function viewDocument(doc: UserProfileDocument) {
    if (doc.signedUrl) {
      window.open(doc.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setProfileErr(`Could not open "${doc.fileName}". The file may be missing from storage.`);
  }

  async function confirmReinstate() {
    if (!reinstateTarget) return;
    await patchUser(reinstateTarget.id, { status: 'ACTIVE' });
    setReinstateTarget(null);
  }

  function requestSuspend() {
    if (!suspendTarget) return;
    const note = suspensionNote.trim();
    if (!note) {
      setErr('Enter a suspension note before suspending this user.');
      return;
    }
    setErr(null);
    setShowSuspendConfirm(true);
  }

  async function confirmSuspend() {
    if (!suspendTarget) return;
    const note = suspensionNote.trim();
    if (!note) {
      setErr('Enter a suspension note before suspending this user.');
      setShowSuspendConfirm(false);
      return;
    }
    setShowSuspendConfirm(false);
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
    if (!matchesStatusFilter(r, statusFilter)) return false;
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
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="under_review">Under review</option>
          <option value="pending">Setup incomplete</option>
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
                <tr
                  key={r.id}
                  className={r.role !== 'ADMIN' ? 'table-row-clickable' : undefined}
                  onClick={() => {
                    if (r.role !== 'ADMIN') void openUserProfile(r);
                  }}
                >
                  <td>
                    <div className="font-medium">{r.email.split('@')[0]}</div>
                    <div className="text-sm text-muted">{r.email}</div>
                  </td>
                  <td className="text-muted">{roleLabel(r.role)}</td>
                  <td>
                    {(() => {
                      const badge = displayStatus(r);
                      return (
                        <span className={`status-badge ${badge.className}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="text-muted">{fmtDate(r.createdAt)}</td>
                  <td className="text-muted">
                    {r.lastLoginAt ? fmtDate(r.lastLoginAt) : '—'}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="action-buttons">
                      {r.status === 'SUSPENDED' || r.status === 'DEACTIVATED' ? (
                        <button
                          type="button"
                          className="icon-btn icon-btn-success"
                          disabled={savingId === r.id}
                          title="Reinstate"
                          onClick={() => openReinstateModal(r)}
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
                Please provide a reason for suspension (required for the audit log).
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
                  onClick={() => requestSuspend()}
                >
                  <Ban size={18} />
                  Suspend
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`modal-overlay${showSuspendConfirm ? ' active' : ''}`}
        style={showSuspendConfirm ? { zIndex: 1100 } : undefined}
        onClick={(e) => {
          if (e.target === e.currentTarget && !savingId) setShowSuspendConfirm(false);
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        {showSuspendConfirm && suspendTarget ? (
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-suspend-confirm-title"
            style={{ maxWidth: 420 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-body">
              <h2
                id="admin-suspend-confirm-title"
                className="modal-title"
                style={{ marginBottom: 8 }}
              >
                Are you sure you want to suspend?
              </h2>
              <p className="text-sm text-muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
                {suspendTarget.email} will be blocked from signing in until you reinstate
                the account.
              </p>
              <div className="grid-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: 12 }}
                  disabled={savingId === suspendTarget.id}
                  onClick={() => setShowSuspendConfirm(false)}
                >
                  No
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    padding: 12,
                    borderColor: '#fecaca',
                    color: '#dc2626',
                  }}
                  disabled={savingId === suspendTarget.id}
                  onClick={() => void confirmSuspend()}
                >
                  {savingId === suspendTarget.id ? 'Suspending…' : 'Yes'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`modal-overlay${profileUser ? ' active' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeProfileModal();
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        {profileUser ? (
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">
                  {profileDetail
                    ? displayNameFromFields(profileDetail.profileFields, profileUser.email)
                    : profileUser.email.split('@')[0]}
                </h2>
                <p className="modal-subtitle">{profileUser.email}</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeProfileModal}
                aria-label="Close"
              >
                <XCircle size={20} color="#64748b" />
              </button>
            </div>
            <div className="modal-body">
              <div className="grid-2 mb-4">
                <div>
                  <p className="text-xs font-medium text-muted" style={{ marginBottom: 4 }}>
                    Role
                  </p>
                  <p className="text-sm">{roleLabel(profileUser.role)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted" style={{ marginBottom: 4 }}>
                    Account status
                  </p>
                  <p className="text-sm">
                    <span className={`status-badge ${displayStatus(profileUser).className}`}>
                      {displayStatus(profileUser).label}
                    </span>
                  </p>
                </div>
              </div>

              {profileLoading ? (
                <p className="text-sm text-muted">Loading profile…</p>
              ) : null}
              {profileErr ? (
                <p className="text-sm" style={{ color: '#dc2626', marginBottom: 12 }}>
                  {profileErr}
                </p>
              ) : null}

              {profileDetail && !profileLoading ? (
                <>
                  <div className="info-box mb-4">
                    <p className="text-xs font-medium text-muted" style={{ marginBottom: 4 }}>
                      CPSNS number
                    </p>
                    <p className="text-sm font-medium" style={{ margin: 0 }}>
                      <code>{cpsnsFromProfileFields(profileDetail.profileFields)}</code>
                    </p>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-medium mb-4">Uploaded documents</p>
                    {profileDetail.documents.length === 0 ? (
                      <p className="text-sm text-muted">No documents uploaded yet.</p>
                    ) : (
                      profileDetail.documents.map((doc) => (
                        <div key={doc.id} className="document-item">
                          <div className="document-info">
                            <FileText size={20} color="#64748b" />
                            <div>
                              <span className="document-name">{doc.label}</span>
                              <div className="text-xs text-muted">{doc.fileName}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 13 }}
                            onClick={() => viewDocument(doc)}
                          >
                            <Eye size={16} />
                            View
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mb-4">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: 13 }}
                      onClick={() => setShowProfileFields((v) => !v)}
                    >
                      <Eye size={16} />
                      {showProfileFields ? 'Hide profile data' : 'Show profile data'}
                    </button>
                    {showProfileFields && profileDetail.profileFields.length > 0 ? (
                      <div
                        className="info-box"
                        style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto' }}
                      >
                        <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
                          {profileDetail.profileFields.map((f) => (
                            <div key={f.label}>
                              <dt className="text-xs font-medium text-muted">{f.label}</dt>
                              <dd
                                className="text-sm"
                                style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}
                              >
                                {f.label === 'CPSNS'
                                  ? formatAdminCpsnsDisplay(f.value)
                                  : f.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </div>

                  {profileDetail.hasProfile &&
                  profileUser.cpsnsVerificationStatus !== 'VERIFIED' ? (
                    <p className="text-sm text-muted" style={{ margin: 0 }}>
                      To approve or reject credentials, use the{' '}
                      <a href="/admin/verifications" className="font-medium">
                        Credential Queue
                      </a>
                      .
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`modal-overlay${reinstateTarget ? ' active' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeReinstateModal();
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        {reinstateTarget ? (
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Reinstate user?</h2>
                <p className="modal-subtitle">{reinstateTarget.email}</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeReinstateModal}
                aria-label="Close"
                disabled={savingId === reinstateTarget.id}
              >
                <XCircle size={20} color="#64748b" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 20 }}>
                This will restore sign-in access for this account.
              </p>
              <div className="grid-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: 12 }}
                  disabled={savingId === reinstateTarget.id}
                  onClick={closeReinstateModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ padding: 12 }}
                  disabled={savingId === reinstateTarget.id}
                  onClick={() => void confirmReinstate()}
                >
                  <UserCheck size={18} />
                  {savingId === reinstateTarget.id ? 'Reinstating…' : 'Yes, reinstate'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
