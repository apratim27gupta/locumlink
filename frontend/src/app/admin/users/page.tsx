'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ban, Bell, ChevronDown, Download, Eye, FileText, Mail, MessageSquare, Search, UserCheck, XCircle } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson, adminDownloadUsersCsv } from '@/lib/adminApi';
import { formatAdminCpsnsDisplay } from '@/lib/cpsnsVerify';
import {
  ADMIN_USER_ACCOUNT_FILTER_OPTIONS,
  ADMIN_USER_CREDENTIAL_FILTER_OPTIONS,
  adminUserDisplayStatus,
  emptyAdminUserAccountCounts,
  emptyAdminUserCredentialCounts,
  type AdminUserAccountFilterValue,
  type AdminUserCredentialFilterValue,
} from '@/lib/adminUserDisplayStatus';
import AdminBroadcastComposeModal, {
  type BroadcastChannel,
  type BroadcastResult,
} from './AdminBroadcastComposeModal';

type CpsnsVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';

type ReminderChannel = 'email' | 'notification';

type Row = {
  id: string;
  email: string;
  role: 'LOCUM' | 'HOST' | 'ADMIN';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DEACTIVATED';
  cpsnsVerificationStatus: CpsnsVerificationStatus | null;
  inCredentialQueue?: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastProfileReminderAt: string | null;
  lastProfileReminderChannel: ReminderChannel | string | null;
};

function roleLabel(role: Row['role']): string {
  if (role === 'HOST') return 'Host Physician';
  if (role === 'LOCUM') return 'Locum Physician';
  return 'Admin';
}

/** Credential + account status for the User Management table. */
function displayStatus(row: Row) {
  return adminUserDisplayStatus(row);
}

/** Available until the profile is verified (including under review / incomplete). */
function canRemindProfile(row: Row): boolean {
  if (row.role === 'ADMIN') return false;
  if (row.status === 'SUSPENDED' || row.status === 'DEACTIVATED') return false;
  if (row.cpsnsVerificationStatus === 'VERIFIED') return false;
  return true;
}

function canBroadcastUser(row: Row): boolean {
  if (row.role === 'ADMIN') return false;
  if (row.status === 'SUSPENDED' || row.status === 'DEACTIVATED') return false;
  return true;
}

function reminderChannelLabel(channel: string | null | undefined): string {
  if (channel === 'email') return 'email';
  if (channel === 'notification') return 'notification';
  return '';
}

type AccountFilterValue = AdminUserAccountFilterValue;
type CredentialFilterValue = AdminUserCredentialFilterValue;

function filterSummary(
  filters: string[],
  options: ReadonlyArray<{ value: string; label: string }>,
  allLabel: string,
): string {
  if (filters.length === 0) return allLabel;
  const labels = options
    .filter((o) => filters.includes(o.value))
    .map((o) => o.label);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
  return `${labels.length} selected`;
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
  const searchParams = useSearchParams();
  const deepLinkUserId = searchParams.get('userId')?.trim() || null;
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [accountFilters, setAccountFilters] = useState<AccountFilterValue[]>(
    [],
  );
  const [credentialFilters, setCredentialFilters] = useState<
    CredentialFilterValue[]
  >([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [credentialMenuOpen, setCredentialMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const credentialMenuRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [accountCounts, setAccountCounts] = useState(
    emptyAdminUserAccountCounts,
  );
  const [credentialCounts, setCredentialCounts] = useState(
    emptyAdminUserCredentialCounts,
  );
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
  const [remindMenuForId, setRemindMenuForId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const remindMenuRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastBanner, setBroadcastBanner] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!remindMenuForId) return;
    function onDocMouseDown(e: MouseEvent) {
      if (remindMenuRef.current?.contains(e.target as Node)) return;
      setRemindMenuForId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [remindMenuForId]);

  useEffect(() => {
    if (!accountMenuOpen && !credentialMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (accountMenuRef.current?.contains(t)) return;
      if (credentialMenuRef.current?.contains(t)) return;
      setAccountMenuOpen(false);
      setCredentialMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAccountMenuOpen(false);
        setCredentialMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen, credentialMenuOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ page: '1', pageSize: '1000' });
      if (debouncedQ.trim()) qs.set('q', debouncedQ.trim());
      if (roleFilter === 'host') qs.set('role', 'HOST');
      if (roleFilter === 'locum') qs.set('role', 'LOCUM');
      if (accountFilters.length > 0) {
        qs.set('accountStatus', accountFilters.join(','));
      }
      if (credentialFilters.length > 0) {
        qs.set('credentialStatus', credentialFilters.join(','));
      }
      const data = await adminFetchJson<{
        users: Row[];
        total?: number;
        accountCounts?: ReturnType<typeof emptyAdminUserAccountCounts>;
        credentialCounts?: ReturnType<typeof emptyAdminUserCredentialCounts>;
      }>(`/api/admin/users?${qs.toString()}`);
      setRows(data.users ?? []);
      setUsersTotal(data.total ?? data.users?.length ?? 0);
      setAccountCounts(data.accountCounts ?? emptyAdminUserAccountCounts());
      setCredentialCounts(
        data.credentialCounts ?? emptyAdminUserCredentialCounts(),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users');
      setRows([]);
      setUsersTotal(0);
      setAccountCounts(emptyAdminUserAccountCounts());
      setCredentialCounts(emptyAdminUserCredentialCounts());
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, roleFilter, accountFilters, credentialFilters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedQ, roleFilter, accountFilters, credentialFilters]);

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

  useEffect(() => {
    if (!deepLinkUserId || loading) return;
    if (deepLinkHandled.current === deepLinkUserId) return;
    const existing = rows.find((r) => r.id === deepLinkUserId);
    if (existing) {
      deepLinkHandled.current = deepLinkUserId;
      void openUserProfile(existing);
      return;
    }
    deepLinkHandled.current = deepLinkUserId;
    void (async () => {
      try {
        const detail = await adminFetchJson<UserProfileDetail>(
          `/api/admin/users/${encodeURIComponent(deepLinkUserId)}/profile`,
        );
        setProfileUser({
          id: detail.userId,
          email: detail.email,
          role: detail.role,
          status: 'ACTIVE',
          cpsnsVerificationStatus: null,
          createdAt: '',
          lastLoginAt: null,
          lastProfileReminderAt: null,
          lastProfileReminderChannel: null,
        });
        setProfileDetail(detail);
        setProfileErr(null);
        setShowProfileFields(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not open linked profile');
      }
    })();
  }, [deepLinkUserId, loading, rows]);

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

  async function sendProfileReminder(row: Row, channel: ReminderChannel) {
    setRemindMenuForId(null);
    setRemindingId(row.id);
    setErr(null);
    try {
      const data = await adminFetchJson<{
        ok: boolean;
        user: {
          id: string;
          lastProfileReminderAt: string | null;
          lastProfileReminderChannel: string | null;
        };
      }>(`/api/admin/users/${encodeURIComponent(row.id)}/remind`, {
        method: 'POST',
        body: JSON.stringify({ channel }),
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                lastProfileReminderAt: data.user.lastProfileReminderAt,
                lastProfileReminderChannel: data.user.lastProfileReminderChannel,
              }
            : r,
        ),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send reminder');
    } finally {
      setRemindingId(null);
    }
  }

  const filtered = rows;

  const eligibleFiltered = filtered.filter(canBroadcastUser);
  const selectedCount = eligibleFiltered.filter((r) => selectedIds.has(r.id)).length;
  const allPageSelected =
    eligibleFiltered.length > 0 &&
    eligibleFiltered.every((r) => selectedIds.has(r.id));

  function toggleRowSelected(row: Row) {
    if (!canBroadcastUser(row)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  function toggleSelectPage() {
    if (allPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(eligibleFiltered.map((r) => r.id)));
  }

  function exitBroadcastMode() {
    setBroadcastMode(false);
    setSelectedIds(new Set());
    setComposeOpen(false);
  }

  const recipientLabel = `${selectedCount} selected`;

  async function sendBroadcast(payload: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    channels: BroadcastChannel[];
    idempotencyKey: string;
  }) {
    setBroadcastSending(true);
    setBroadcastBanner(null);
    setErr(null);
    try {
      const ids = eligibleFiltered
        .filter((r) => selectedIds.has(r.id))
        .map((r) => r.id);
      if (ids.length === 0) throw new Error('No recipients selected');

      const result = await adminFetchJson<BroadcastResult>(
        '/api/admin/users/broadcast',
        {
          method: 'POST',
          body: JSON.stringify({
            channels: payload.channels,
            subject: payload.subject,
            bodyHtml: payload.bodyHtml,
            bodyText: payload.bodyText,
            userIds: ids,
            idempotencyKey: payload.idempotencyKey,
          }),
        },
      );

      if (result.duplicate) {
        setBroadcastBanner(
          `Already sent — duplicate blocked for ${result.recipientCount} user${result.recipientCount === 1 ? '' : 's'} (no extra messages were queued).`,
        );
      } else if (result.queued) {
        setBroadcastBanner(
          `Sent successfully — message queued for ${result.recipientCount} user${result.recipientCount === 1 ? '' : 's'}. Delivery continues in the background.`,
        );
      } else {
        const parts = [
          `Sent successfully to ${result.recipientCount} user${result.recipientCount === 1 ? '' : 's'}`,
        ];
        if (result.sentNotification > 0) {
          parts.push(
            `${result.sentNotification} notification${result.sentNotification === 1 ? '' : 's'}`,
          );
        }
        if (result.sentEmail > 0) {
          parts.push(
            `${result.sentEmail} email${result.sentEmail === 1 ? '' : 's'}`,
          );
        }
        if (result.failed.length > 0) {
          parts.push(`${result.failed.length} failed`);
          setBroadcastBanner(`${parts.join(' · ')}. Some deliveries failed.`);
          setErr(
            result.failed
              .slice(0, 3)
              .map((f) => f.error)
              .join('; ') + (result.failed.length > 3 ? '…' : ''),
          );
        } else {
          setBroadcastBanner(parts.join(' · '));
        }
      }
      setComposeOpen(false);
      exitBroadcastMode();
    } finally {
      setBroadcastSending(false);
    }
  }

  return (
    <AdminLayout>
      <div className="header-with-actions">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">View, suspend, and reinstate user accounts</p>
        </div>
        <div className="header-actions">
          {!broadcastMode ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setBroadcastBanner(null);
                setBroadcastMode(true);
              }}
            >
              <MessageSquare size={16} />
              Broadcast
            </button>
          ) : null}
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
      {broadcastBanner ? (
        <div
          className="error-banner"
          style={{
            background: '#ecfdf5',
            borderColor: '#a7f3d0',
            color: '#065f46',
          }}
        >
          {broadcastBanner}
        </div>
      ) : null}

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
        <div className="multi-select" ref={accountMenuRef}>
          <button
            type="button"
            className="input multi-select-trigger"
            aria-haspopup="listbox"
            aria-expanded={accountMenuOpen}
            onClick={() => {
              setAccountMenuOpen((open) => !open);
              setCredentialMenuOpen(false);
            }}
          >
            <span className="multi-select-label">
              {filterSummary(
                accountFilters,
                ADMIN_USER_ACCOUNT_FILTER_OPTIONS,
                'All accounts',
              )}
            </span>
            <ChevronDown size={16} aria-hidden />
          </button>
          {accountMenuOpen ? (
            <div
              className="multi-select-menu"
              role="listbox"
              aria-multiselectable="true"
            >
              <label className="multi-select-option">
                <input
                  type="checkbox"
                  checked={accountFilters.length === 0}
                  onChange={() => setAccountFilters([])}
                />
                <span>All accounts</span>
              </label>
              {ADMIN_USER_ACCOUNT_FILTER_OPTIONS.map((opt) => {
                const checked = accountFilters.includes(opt.value);
                const count = accountCounts[opt.value] ?? 0;
                return (
                  <label key={opt.value} className="multi-select-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setAccountFilters((prev) => {
                          if (prev.includes(opt.value)) {
                            return prev.filter((v) => v !== opt.value);
                          }
                          return [...prev, opt.value];
                        });
                      }}
                    />
                    <span>
                      {opt.label} ({count})
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="multi-select" ref={credentialMenuRef}>
          <button
            type="button"
            className="input multi-select-trigger"
            aria-haspopup="listbox"
            aria-expanded={credentialMenuOpen}
            onClick={() => {
              setCredentialMenuOpen((open) => !open);
              setAccountMenuOpen(false);
            }}
          >
            <span className="multi-select-label">
              {filterSummary(
                credentialFilters,
                ADMIN_USER_CREDENTIAL_FILTER_OPTIONS,
                'All credentials',
              )}
            </span>
            <ChevronDown size={16} aria-hidden />
          </button>
          {credentialMenuOpen ? (
            <div
              className="multi-select-menu"
              role="listbox"
              aria-multiselectable="true"
            >
              <label className="multi-select-option">
                <input
                  type="checkbox"
                  checked={credentialFilters.length === 0}
                  onChange={() => setCredentialFilters([])}
                />
                <span>All credentials</span>
              </label>
              {ADMIN_USER_CREDENTIAL_FILTER_OPTIONS.map((opt) => {
                const checked = credentialFilters.includes(opt.value);
                const count = credentialCounts[opt.value] ?? 0;
                return (
                  <label key={opt.value} className="multi-select-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setCredentialFilters((prev) => {
                          if (prev.includes(opt.value)) {
                            return prev.filter((v) => v !== opt.value);
                          }
                          return [...prev, opt.value];
                        });
                      }}
                    />
                    <span>
                      {opt.label} ({count})
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Account and credentials are separate filters (AND). Multi-select within
        each is OR
        {!loading ? ` · showing ${filtered.length} of ${usersTotal}` : ''}.
      </p>

      {broadcastMode ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            padding: '10px 12px',
            background: '#F8FAFC',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
          }}
        >
          <span className="text-sm font-medium">
            {selectedCount > 0 ? `${selectedCount} selected` : 'Select users to message'}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: 13 }}
            onClick={exitBroadcastMode}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '6px 12px', fontSize: 13, marginLeft: 'auto' }}
            disabled={selectedCount === 0}
            onClick={() => {
              setBroadcastBanner(null);
              setComposeOpen(true);
            }}
          >
            <MessageSquare size={14} />
            Send message
          </button>
        </div>
      ) : null}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {broadcastMode ? (
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    disabled={loading || eligibleFiltered.length === 0}
                    onChange={toggleSelectPage}
                    aria-label="Select all on page"
                    title="Select all on page"
                  />
                </th>
              ) : null}
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Last activity</th>
              <th>Last reminder</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={broadcastMode ? 8 : 7} className="text-muted">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={broadcastMode ? 8 : 7} className="text-muted">
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
                  {broadcastMode ? (
                    <td onClick={(e) => e.stopPropagation()}>
                      {canBroadcastUser(r) ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleRowSelected(r)}
                          aria-label={`Select ${r.email}`}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  ) : null}
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
                  <td className="text-muted">
                    {r.lastProfileReminderAt ? (
                      <div>
                        <div>{fmtDate(r.lastProfileReminderAt)}</div>
                        {reminderChannelLabel(r.lastProfileReminderChannel) ? (
                          <div className="text-sm text-muted">
                            via {reminderChannelLabel(r.lastProfileReminderChannel)}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="action-buttons">
                      {canRemindProfile(r) ? (
                        <div
                          ref={remindMenuForId === r.id ? remindMenuRef : undefined}
                          style={{ position: 'relative' }}
                        >
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={remindingId === r.id || savingId === r.id}
                            title="Remind to complete profile"
                            aria-expanded={remindMenuForId === r.id}
                            onClick={() =>
                              setRemindMenuForId((id) => (id === r.id ? null : r.id))
                            }
                          >
                            <Bell size={16} color="#2563eb" />
                          </button>
                          {remindMenuForId === r.id ? (
                            <div
                              role="menu"
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                marginTop: 4,
                                minWidth: 180,
                                background: '#fff',
                                border: '1px solid #E5E7EB',
                                borderRadius: 8,
                                boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                                zIndex: 20,
                                overflow: 'hidden',
                              }}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                disabled={remindingId === r.id}
                                onClick={() => void sendProfileReminder(r, 'notification')}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '10px 12px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  color: '#334155',
                                  textAlign: 'left',
                                }}
                              >
                                <Bell size={14} />
                                Via notification
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                disabled={remindingId === r.id}
                                onClick={() => void sendProfileReminder(r, 'email')}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '10px 12px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  color: '#334155',
                                  textAlign: 'left',
                                  borderTop: '1px solid #F1F5F9',
                                }}
                              >
                                <Mail size={14} />
                                Via email
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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

      <AdminBroadcastComposeModal
        open={composeOpen}
        recipientLabel={recipientLabel}
        sending={broadcastSending}
        onClose={() => {
          if (!broadcastSending) setComposeOpen(false);
        }}
        onSend={sendBroadcast}
      />
    </AdminLayout>
  );
}
