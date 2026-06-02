'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Eye,
  FileText,
  XCircle,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson } from '@/lib/adminApi';
import {
  adminVerificationStatusTag,
  formatAdminCpsnsDisplay,
} from '@/lib/cpsnsVerify';

type VerificationRow = {
  id: string;
  profileType?: 'locum' | 'host';
  userRole?: 'LOCUM' | 'HOST';
  userId: string;
  email: string;
  name: string;
  cpsns: string;
  submittedAt: string;
  cpsnsVerificationStatus:
    | 'UNVERIFIED'
    | 'PENDING_REVIEW'
    | 'VERIFIED'
    | 'REJECTED';
};

type VerificationDocument = {
  id: string;
  label: string;
  fileName: string;
  signedUrl: string;
};

type ProfileField = { label: string; value: string };

type VerificationDetail = {
  profileType: 'locum' | 'host';
  documents: VerificationDocument[];
  profileFields: ProfileField[];
};

function waitDays(submittedAt: string): number {
  const ms = Date.now() - new Date(submittedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function resolveProfileType(
  row: Pick<VerificationRow, 'profileType' | 'userRole'>,
): 'locum' | 'host' {
  if (row.profileType === 'host' || row.profileType === 'locum') {
    return row.profileType;
  }
  if (row.userRole === 'HOST') return 'host';
  return 'locum';
}

function fmtDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return ts;
  }
}

export default function AdminVerificationsPage() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [review, setReview] = useState<VerificationRow | null>(null);
  const [reviewDetail, setReviewDetail] = useState<VerificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [showProfileData, setShowProfileData] = useState(false);
  const [notes, setNotes] = useState('');

  const openReview = useCallback(async (row: VerificationRow) => {
    setReview(row);
    setNotes('');
    setShowProfileData(false);
    setReviewDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    try {
      const profileType = resolveProfileType(row);
      const detail = await adminFetchJson<VerificationDetail>(
        `/api/admin/verifications/${row.id}?profileType=${profileType}`,
      );
      setReviewDetail(detail);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Could not load documents');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function closeReview() {
    setReview(null);
    setReviewDetail(null);
    setShowProfileData(false);
    setDetailErr(null);
  }

  function viewDocument(doc: VerificationDocument) {
    if (doc.signedUrl) {
      window.open(doc.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setDetailErr(`Could not open "${doc.fileName}". The file may be missing from storage.`);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await adminFetchJson<{ items: VerificationRow[] }>(
        '/api/admin/verifications',
      );
      setRows(
        (data.items ?? []).map((item) => ({
          ...item,
          profileType: resolveProfileType(item),
        })),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchStatus(
    row: VerificationRow,
    cpsnsVerificationStatus: 'VERIFIED' | 'REJECTED',
  ) {
    const rejectionReason = notes.trim();
    if (cpsnsVerificationStatus === 'REJECTED' && !rejectionReason) {
      setErr('Enter a rejection reason before rejecting.');
      return;
    }

    setBusyId(row.id);
    setErr(null);
    try {
      const profileType = resolveProfileType(row);
      await adminFetchJson(
        `/api/admin/verifications/${row.id}?profileType=${profileType}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            cpsnsVerificationStatus,
            profileType,
            ...(cpsnsVerificationStatus === 'REJECTED' ? { rejectionReason } : {}),
          }),
        },
      );
      closeReview();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = rows.length;

  return (
    <AdminLayout>
      <div className="header-with-actions">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Credential Verification Queue</h1>
          <p className="page-description">
            New locum and host profiles appear here until you approve their CPSNS.
            They are not verified automatically — use Review, then Verify &amp; Approve
            (Target: 48h turnaround).
          </p>
        </div>
        <div className="header-actions">
          <span className="pending-count">
            {loading ? '…' : `${pendingCount} Pending`}
          </span>
        </div>
      </div>

      {err ? <div className="error-banner">{err}</div> : null}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Physician / clinic</th>
              <th>CPSNS #</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Documents</th>
              <th className="wait-time-col">Wait Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted">
                  No pending verifications.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const days = waitDays(r.submittedAt);
                const urgent = days >= 3;
                const statusTag = adminVerificationStatusTag(
                  r.cpsnsVerificationStatus,
                  r.cpsns,
                );
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-sm text-muted">{r.email}</div>
                      <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                        {resolveProfileType(r) === 'host' ? 'Host clinic' : 'Locum'}
                      </div>
                    </td>
                    <td>
                      <code>{formatAdminCpsnsDisplay(r.cpsns)}</code>
                    </td>
                    <td>
                      <span
                        className="tag"
                        style={{
                          background: statusTag.background,
                          color: statusTag.color,
                        }}
                      >
                        {statusTag.label}
                      </span>
                    </td>
                    <td className="text-muted">{fmtDate(r.submittedAt)}</td>
                    <td>
                      <span className="tag">CPSNS License</span>
                      <span className="tag">Profile</span>
                    </td>
                    <td className="wait-time-col">
                      <span
                        className={`wait-time-value text-sm${urgent ? ' font-medium' : ''}`}
                        style={{ color: urgent ? '#dc2626' : '#64748b' }}
                      >
                        <Clock size={16} aria-hidden />
                        {days === 0 ? '< 1 day' : `${days} day${days === 1 ? '' : 's'}`}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openReview(r)}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div
        className={`modal-overlay${review ? ' active' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeReview();
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        {review ? (
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{review.name}</h2>
                <p className="modal-subtitle">
                  CPSNS: <span>{formatAdminCpsnsDisplay(review.cpsns)}</span>
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeReview}
                aria-label="Close"
              >
                <XCircle size={20} color="#64748b" />
              </button>
            </div>
            <div className="modal-body">
              <div className="grid-2 mb-4">
                <div>
                  <p className="text-xs font-medium text-muted" style={{ marginBottom: 4 }}>
                    Email
                  </p>
                  <p className="text-sm">{review.email}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted" style={{ marginBottom: 4 }}>
                    Submitted
                  </p>
                  <p className="text-sm">{fmtDate(review.submittedAt)}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium mb-4">Uploaded Documents</p>
                {detailLoading ? (
                  <p className="text-sm text-muted">Loading documents…</p>
                ) : null}
                {detailErr ? (
                  <p className="text-sm" style={{ color: '#dc2626', marginBottom: 8 }}>
                    {detailErr}
                  </p>
                ) : null}
                {!detailLoading && reviewDetail?.documents.length === 0 ? (
                  <p className="text-sm text-muted">No documents uploaded yet.</p>
                ) : null}
                {reviewDetail?.documents.map((doc) => (
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
                      disabled={detailLoading}
                      onClick={() => viewDocument(doc)}
                    >
                      <Eye size={16} />
                      View
                    </button>
                  </div>
                ))}
                <div className="document-item" style={{ marginTop: 8 }}>
                  <div className="document-info">
                    <FileText size={20} color="#64748b" />
                    <span className="document-name">Profile data</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    disabled={detailLoading}
                    onClick={() => {
                      if (!reviewDetail?.profileFields.length) {
                        setDetailErr('Profile data could not be loaded.');
                        return;
                      }
                      setShowProfileData((v) => !v);
                    }}
                  >
                    <Eye size={16} />
                    {showProfileData ? 'Hide' : 'View'}
                  </button>
                </div>
                {showProfileData && reviewDetail?.profileFields.length ? (
                  <div
                    className="info-box"
                    style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto' }}
                  >
                    <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
                      {reviewDetail.profileFields.map((f) => (
                        <div key={f.label}>
                          <dt className="text-xs font-medium text-muted">{f.label}</dt>
                          <dd className="text-sm" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                            {f.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </div>

              <div className="info-box">
                <p className="info-title">Verification Steps:</p>
                <ol className="info-list">
                  <li>Cross-reference CPSNS number with CPSNS public registry</li>
                  <li>Verify active license status and specialty</li>
                  <li>Review uploaded CV for qualifications</li>
                  <li>Check for any disciplinary actions or restrictions</li>
                </ol>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium mb-4">Decision</p>
                <div className="grid-2 mb-4">
                  <button
                    type="button"
                    className="btn btn-success"
                    style={{ padding: 12 }}
                    disabled={busyId === review.id}
                    onClick={() => patchStatus(review, 'VERIFIED')}
                  >
                    <CheckCircle size={20} />
                    Verify &amp; Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: 12 }}
                    disabled={busyId === review.id || !notes.trim()}
                    title={
                      !notes.trim()
                        ? 'Enter a rejection reason in the notes field'
                        : undefined
                    }
                    onClick={() => patchStatus(review, 'REJECTED')}
                  >
                    <XCircle size={20} />
                    Reject
                  </button>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="review-notes">
                    Reason / Notes (required for rejection)
                  </label>
                  <textarea
                    id="review-notes"
                    className="input"
                    placeholder="Enter verification notes or rejection reason…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
