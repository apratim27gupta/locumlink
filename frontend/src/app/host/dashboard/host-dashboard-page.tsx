'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { useAuth } from '@/providers/AuthProvider';
import { hostProfileCompletionPct } from '@/lib/hostProfileCompletion';
import { computeAvatarInitials } from '@/lib/avatarInitials';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { isCpsnsVerified } from '@/lib/cpsnsVerify';
import {
  ApiHttpError,
  hostApi,
  type Job,
  type ApplicationRecord,
  type DashboardStats,
  type CreateJobPayload,
  type LocumDocumentSnippet,
} from '@/lib/api';
import type { HostProfile } from '@/types';
import {
  BellIcon,
  BookIcon,
  EmptyIllustration,
  FileIcon,
  MessageIcon,
  PlusIcon,
  ProfileIcon,
  ShieldIcon,
  UserEditIcon,
} from './host-dashboard-icons';

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'postings', label: 'My Postings', href: '/host/dashboard' },
  { id: 'profile', label: 'Profile', href: '/host/profile' },
  { id: 'messages', label: 'Messages', href: '/host/messages' },
  { id: 'resources', label: 'Resources', href: '/host/resources' },
];
const TABS = [
  { id: 'active', label: 'Active Posts' },
  { id: 'ongoing', label: 'Ongoing Jobs' },
  { id: 'recent', label: 'Recent Jobs' },
  { id: 'draft', label: 'Draft Jobs' },
];
const NAVBAR_HEIGHT = 72;
const CREDENTIAL_OPTIONS = [
  'CPSNS Full License',
  'CFPC Eligible',
  'CMPA coverage',
  'BLS (ACLS preferred)',
  'DEA License',
  'PALS Certified',
];

// ─── Tiny shared styles ───────────────────────────────────────────────────────

const fieldInp: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #D0D5DD',
  borderRadius: 8,
  fontSize: 14,
  color: '#0B0F1F',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 6,
};

// ─── Helper functions ─────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

/** Parses MM-DD-YYYY to ISO yyyy-mm-dd; returns '' if invalid or empty. */
function parseMmDdYyyyToIso(input: string): string {
  const t = input.trim();
  if (!t) return '';
  const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return '';
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100)
    return '';
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const d = new Date(`${iso}T12:00:00`);
  return d.getFullYear() === yyyy && d.getMonth() + 1 === mm && d.getDate() === dd
    ? iso
    : '';
}

function getLocumDisplayName(app: ApplicationRecord): string {
  const { firstName, lastName, user } = app.locumProfile;
  if (firstName || lastName)
    return `Dr ${firstName ?? ''} ${lastName ?? ''}`.trim();
  return user.email.split('@')[0];
}

// ─── SVG icons (local) ────────────────────────────────────────────────────────

function DetailsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M10.5 2H4.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L10.5 2Z"
        stroke="#3B4FD8"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 2v4H15M6.5 9h5M6.5 11.5h5M6.5 7h2"
        stroke="#3B4FD8"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ScheduleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect
        x="2"
        y="4"
        width="14"
        height="12"
        rx="2"
        stroke="#3B4FD8"
        strokeWidth="1.4"
      />
      <path
        d="M6 2v3M12 2v3M2 8h14"
        stroke="#3B4FD8"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function RequirementsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2L11 7h5l-4 3 1.5 5L9 12l-4.5 3L6 10 2 7h5L9 2Z"
        stroke="#3B4FD8"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect
        x="1"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        stroke="#6B7280"
        strokeWidth="1.2"
      />
      <path
        d="M4.5 1.5v2M9.5 1.5v2M1 6h12"
        stroke="#6B7280"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ActiveBadge() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        width: 20,
        height: 20,
        borderRadius: 4,
        background: '#1C32D2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2 6l3 3 5-5"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 4l4 4-4 4"
        stroke="#9CA3AF"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function GrayBadge() {
  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        background: '#F3F4F6',
        border: '1px solid #E5E7EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path
          d="M2 5.5l2.5 2.5 4.5-4.5"
          stroke="#9CA3AF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
function CollapsedStep({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: '#FAFAFA',
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: '#EEF0FB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <Chevron />
      <GrayBadge />
    </div>
  );
}
function UpcomingStep({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: '#FAFAFA',
        border: '1px solid #E5E7EB',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: '#F3F4F6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <Chevron />
    </div>
  );
}

// ─── Comparison badge (stats) ─────────────────────────────────────────────────

function CompBadge({
  change,
  direction,
  period,
}: {
  change: number;
  direction: 'up' | 'down';
  period: string;
}) {
  const up = direction === 'up';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          background: up ? '#ECFDF5' : '#F9FAFB',
          color: up ? '#059669' : '#9CA3AF',
          padding: '2px 7px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {up ? '↗' : '↘'}
        {change}%
      </span>
      <span style={{ fontSize: 11, color: '#9CA3AF' }}>
        Compared to the previous {period}
      </span>
    </div>
  );
}

// ─── Re-open modal ────────────────────────────────────────────────────────────

function ReOpenModal({
  job,
  onConfirm,
  onCancel,
}: {
  job: Job;
  onConfirm: (extra: number) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [extra, setExtra] = useState('10');
  const [dontShow, setDontShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (step === 1) {
      setStep(2);
      return;
    }
    setBusy(true);
    await onConfirm(Number(extra) || 10);
    setBusy(false);
  }

  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(28,50,130,0.4)',
          zIndex: 300,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: '#fff',
          borderRadius: 12,
          padding: '28px 32px',
          width: 420,
          zIndex: 301,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: '#0B0F1F' }}>
            {step === 1 ? 'Re-open the position' : 'How many more applicants?'}
          </span>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: '#6B7280',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {step === 1 ? (
          <>
            <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
              This would un-confirm the current Locum, and republish the Job
              post.
            </p>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: '#374151',
                cursor: 'pointer',
                marginBottom: 24,
              }}
            >
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: '#1C32D2' }}
              />
              Don&apos;t show again
            </label>
          </>
        ) : (
          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Additional applicants to accept</label>
            <input
              type="number"
              min={1}
              style={{ ...fieldInp, maxWidth: 160 }}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 24px',
              border: '1px solid #D0D5DD',
              borderRadius: 8,
              background: '#fff',
              color: '#374151',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{
              padding: '9px 24px',
              border: 'none',
              borderRadius: 8,
              background: 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Reopening…' : step === 1 ? 'Okay' : 'Reopen'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Applicant side panel ─────────────────────────────────────────────────────

function ApplicantSidePanel({
  app,
  jobId,
  onClose,
  onShortlisted,
}: {
  app: ApplicationRecord;
  jobId: string;
  onClose: () => void;
  onShortlisted: (appId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isShortlisted =
    app.status === 'SHORTLISTED' || app.status === 'CONFIRMED';
  const displayName = getLocumDisplayName(app);
  const lp = app.locumProfile;

  async function handleShortlist() {
    setBusy(true);
    try {
      await hostApi.updateApplication(jobId, app.id, 'SHORTLISTED');
      onShortlisted(app.id);
    } finally {
      setBusy(false);
    }
  }

  const docLabel: Record<string, string> = {
    CPSNS_LICENSE: 'CPSNS License',
    CMPA_CERTIFICATE: 'CMPA Certificate',
    DEA_CERTIFICATE: 'DEA Certificate',
    CV: 'Resume / CV',
    PHOTO_ID: 'Photo ID',
    OTHER: 'Document',
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.2)',
          zIndex: 200,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 420,
          height: '100vh',
          background: '#fff',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '22px 24px 16px',
            borderBottom: '1px solid #F3F4F6',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: '#0B0F1F' }}>
            Professional Info
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: '#6B7280',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Name + location */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
              }}
            >
              <ShieldIcon />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#309BB7' }}>
                {displayName}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>
              {lp.user.email}
            </div>
            {lp.cpsnsId && (
              <div style={{ fontSize: 13, color: '#6B7280' }}>
                CPSNS: {lp.cpsnsId}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleShortlist}
              disabled={busy || isShortlisted}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                background: isShortlisted
                  ? '#E5E7EB'
                  : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                color: isShortlisted ? '#6B7280' : '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: isShortlisted ? 'default' : 'pointer',
              }}
            >
              {isShortlisted
                ? '✓ Shortlisted'
                : busy
                  ? 'Shortlisting…'
                  : 'Shortlist'}
            </button>
            <Link
              href={isShortlisted ? `/host/messages` : '#'}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 0',
                borderRadius: 8,
                border: `1px solid ${isShortlisted ? '#1C32D2' : '#E5E7EB'}`,
                background: '#fff',
                color: isShortlisted ? '#1C32D2' : '#9CA3AF',
                fontWeight: 500,
                fontSize: 14,
                textDecoration: 'none',
                pointerEvents: isShortlisted ? 'auto' : 'none',
              }}
            >
              💬 Message
            </Link>
          </div>

          {/* About */}
          {lp.summary && (
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#0B0F1F',
                  marginBottom: 8,
                }}
              >
                About
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: '#6B7280',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {lp.summary}
              </p>
            </div>
          )}

          {/* Specialization */}
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: '#0B0F1F',
                marginBottom: 10,
              }}
            >
              Specialization
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span
                style={{
                  padding: '5px 14px',
                  background: 'rgba(115,177,251,0.12)',
                  borderRadius: 20,
                  fontSize: 13,
                  color: '#1C32D2',
                }}
              >
                {lp.specialty.replace(/_/g, ' ')}
              </span>
              {lp.yearsOfExperience != null && (
                <span
                  style={{
                    padding: '5px 14px',
                    background: '#F3F4F6',
                    borderRadius: 20,
                    fontSize: 13,
                    color: '#374151',
                  }}
                >
                  {lp.yearsOfExperience} yrs exp
                </span>
              )}
            </div>
          </div>

          {/* Docs */}
          {lp.documents.length > 0 && (
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#0B0F1F',
                  marginBottom: 10,
                }}
              >
                Docs
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lp.documents.map((doc: LocumDocumentSnippet) => (
                  <a
                    key={doc.id}
                    href={doc.storageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      textDecoration: 'none',
                      color: '#0B0F1F',
                    }}
                  >
                    <CalendarIcon />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {docLabel[doc.documentType] ?? doc.documentType}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {doc.fileName}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M5 3l4 4-4 4"
                        stroke="#9CA3AF"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Inline applicants table ──────────────────────────────────────────────────

function InlineApplicantsTable({
  jobId,
  jobTitle,
  applications,
  loading,
  onApplicantClick,
  onViewAll,
}: {
  jobId: string;
  jobTitle: string;
  applications: ApplicationRecord[];
  loading: boolean;
  onApplicantClick: (app: ApplicationRecord) => void;
  onViewAll: () => void;
}) {
  const preview = applications.slice(0, 7);

  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Sub-header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #F3F4F6',
        }}
      >
        <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>
          {jobTitle}
        </span>
        <button
          onClick={onViewAll}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 13,
            color: '#1C32D2',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          View all{' '}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M5 3l4 4-4 4"
              stroke="#1C32D2"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Table heading */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 90px 1fr 130px 80px',
          gap: '0 8px',
          padding: '10px 16px',
          borderBottom: '1px solid #F3F4F6',
        }}
      >
        {['', 'NAME', 'YRS EXP', 'CREDENTIALS', 'STATUS', ''].map((h, i) => (
          <span
            key={i}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#9CA3AF',
              letterSpacing: '0.06em',
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {loading && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            fontSize: 13,
            color: '#9CA3AF',
          }}
        >
          Loading applicants…
        </div>
      )}

      {!loading && preview.length === 0 && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            fontSize: 13,
            color: '#9CA3AF',
          }}
        >
          No applicants yet
        </div>
      )}

      {!loading &&
        preview.map((app, idx) => {
          const isShortlisted =
            app.status === 'SHORTLISTED' || app.status === 'CONFIRMED';
          const specs = [app.locumProfile.specialty.replace(/_/g, ' ')];
          return (
            <div
              key={app.id}
              onClick={() => onApplicantClick(app)}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 90px 1fr 130px 80px',
                gap: '0 8px',
                padding: '10px 16px',
                borderBottom:
                  idx < preview.length - 1 ? '1px solid #F9FAFB' : 'none',
                cursor: 'pointer',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{idx + 1}</span>
              <span style={{ fontSize: 14, color: '#0B0F1F', fontWeight: 500 }}>
                {getLocumDisplayName(app)}
              </span>
              <span
                style={{ fontSize: 13, color: '#6B7280', textAlign: 'center' }}
              >
                {app.locumProfile.yearsOfExperience ?? '—'}
              </span>
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  flexWrap: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {specs.slice(0, 1).map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: '3px 8px',
                      background: '#F3F4F6',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#374151',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isShortlisted ? '#22C55E' : '#D1D5DB',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: isShortlisted ? '#166534' : '#6B7280',
                  }}
                >
                  {isShortlisted ? 'Shortlisted' : 'Pending'}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                }}
                style={{
                  all: 'unset',
                  cursor: isShortlisted ? 'pointer' : 'default',
                  opacity: isShortlisted ? 1 : 0.35,
                  fontSize: 12,
                  color: '#1C32D2',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                💬 Message
              </button>
            </div>
          );
        })}
    </div>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  expandedJobId,
  applications,
  loadingAppsFor,
  onToggleApplicants,
  onApplicantClick,
  onViewAll,
  onReOpen,
  onEdit,
}: {
  job: Job;
  expandedJobId: string | null;
  applications: Record<string, ApplicationRecord[]>;
  loadingAppsFor: string | null;
  onToggleApplicants: (jobId: string) => void;
  onApplicantClick: (app: ApplicationRecord, jobId: string) => void;
  onViewAll: (jobId: string) => void;
  onReOpen: (job: Job) => void;
  onEdit: (job: Job) => void;
}) {
  const isExpanded = expandedJobId === job.id;
  const isFilled = job.status === 'FILLED';
  const isDraft = job.status === 'DRAFT';
  const appCount = job.applicationsCount;
  const startFmt = fmtDate(job.startDate);
  const endFmt = fmtDate(job.endDate);
  const pay = job.payPerDay
    ? `$${Number(job.payPerDay).toLocaleString()}/day`
    : null;

  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        background: '#fff',
        padding: '18px 20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        {/* Left */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 17,
              color: '#0B0F1F',
              marginBottom: 6,
              lineHeight: 1.3,
            }}
          >
            {job.title}
          </div>
          {job.description && (
            <div
              style={{
                fontSize: 13,
                color: '#6B7280',
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              {job.description.length > 130
                ? job.description.slice(0, 130) + '…'
                : job.description}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            {(startFmt || endFmt) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <CalendarIcon />
                <span style={{ fontSize: 13, color: '#374151' }}>
                  {startFmt}
                  {startFmt && endFmt && ' – '}
                  {endFmt}
                </span>
              </div>
            )}
            {pay && (
              <span style={{ fontWeight: 700, fontSize: 15, color: '#0B0F1F' }}>
                {pay}
              </span>
            )}
          </div>
        </div>

        {/* Right */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-end',
            flexShrink: 0,
          }}
        >
          {isFilled ? (
            <>
              <span
                style={{
                  padding: '4px 14px',
                  background: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#6B7280',
                  fontWeight: 600,
                }}
              >
                Filled
              </span>
              <button
                onClick={() => onReOpen(job)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#1C32D2',
                  fontWeight: 600,
                  padding: '4px 14px',
                  border: '1px solid #1C32D2',
                  borderRadius: 6,
                }}
              >
                Re-open
              </button>
            </>
          ) : isDraft ? (
            <span
              style={{
                padding: '6px 16px',
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: 6,
                color: '#92400E',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Draft
            </span>
          ) : (
            <button
              onClick={() => onToggleApplicants(job.id)}
              style={{
                padding: '6px 16px',
                background: isExpanded
                  ? '#EEF0FB'
                  : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                border: 'none',
                borderRadius: 6,
                color: isExpanded ? '#1C32D2' : '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {appCount} Applicant{appCount !== 1 ? 's' : ''}
            </button>
          )}
          <button
            onClick={() => onEdit(job)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: 13,
              color: '#6B7280',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ✏️ edit
          </button>
        </div>
      </div>

      {/* Inline applicants */}
      {isExpanded && !isDraft && (
        <InlineApplicantsTable
          jobId={job.id}
          jobTitle={job.title}
          applications={applications[job.id] ?? []}
          loading={loadingAppsFor === job.id}
          onApplicantClick={(app) => onApplicantClick(app, job.id)}
          onViewAll={() => onViewAll(job.id)}
        />
      )}
    </div>
  );
}

// ─── Job Posting Overlay (3-step form, wired to API) ─────────────────────────

function JobPostingOverlay({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(1);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [keyResponsibilities, setKeyResponsibilities] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [startTime, setStartTime] = useState('05:00');
  const [endTime, setEndTime] = useState('14:00');
  const [flexible, setFlexible] = useState(false);
  const [ratePerDay, setRatePerDay] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [credentials, setCredentials] = useState<string[]>([
    'CPSNS Full License',
  ]);
  const [travelReq, setTravelReq] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  function toggle(c: string) {
    setCredentials((p) =>
      p.includes(c) ? p.filter((x) => x !== c) : [...p, c],
    );
  }

  async function handleDone() {
    if (!jobTitle.trim()) {
      setSubmitError('Please enter a job title.');
      return;
    }
    const startIso = parseMmDdYyyyToIso(startDateInput);
    const endIso = parseMmDdYyyyToIso(endDateInput);
    if (startDateInput.trim() && !startIso) {
      setSubmitError('Start date must be a valid date in MM-DD-YYYY format.');
      return;
    }
    if (endDateInput.trim() && !endIso) {
      setSubmitError('End date must be a valid date in MM-DD-YYYY format.');
      return;
    }
    const rateNum = ratePerDay.trim() ? Number(ratePerDay) : NaN;
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setSubmitError('Enter a valid rate per day (CAD).');
      return;
    }
    const yearsNum = yearsExp.trim() ? Number(yearsExp) : NaN;
    if (yearsExp.trim() && !Number.isFinite(yearsNum)) {
      setSubmitError('Years of experience must be a number.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload: CreateJobPayload = {
        title: jobTitle.trim(),
        description: jobDescription.trim() || undefined,
        keyResponsibilities: keyResponsibilities
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        startDate: startIso || undefined,
        endDate: endIso || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        payPerDay: rateNum,
        minYearsExperience:
          yearsExp.trim() && Number.isFinite(yearsNum) ? yearsNum : undefined,
        requiredCredentials: credentials,
        travelRequired: travelReq,
        scheduleFlexible: flexible,
      };
      await hostApi.createJob(payload);
      onSuccess();
    } catch (e: unknown) {
      if (e instanceof ApiHttpError && e.status === 401) {
        setSubmitError('Session expired or not signed in. Open Auth and sign in again, then try posting.');
      } else {
        setSubmitError(
          e instanceof Error
            ? e.message
            : 'Failed to create job. Please try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(28,50,130,0.45)',
          zIndex: 200,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 480,
          height: '100vh',
          background: '#fff',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 24px 18px',
            borderBottom: '1px solid #F3F4F6',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: '#0B0F1F' }}>
            Create New Post
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: '#6B7280',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* STEP 1 */}
          {step === 1 ? (
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px 10px',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: '#EEF0FB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <DetailsIcon />
                </div>
                <div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}
                  >
                    Details
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    Define the role and culture.
                  </div>
                </div>
              </div>
              <ActiveBadge />
              <div
                style={{
                  padding: '0 16px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div>
                  <label style={lbl}>Job Title *</label>
                  <input
                    style={fieldInp}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Job Title"
                  />
                </div>
                <div>
                  <label style={lbl}>Job Description</label>
                  <textarea
                    style={
                      {
                        ...fieldInp,
                        height: 90,
                        resize: 'none',
                      } as React.CSSProperties
                    }
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Describe the role…"
                  />
                </div>
                <div>
                  <label style={lbl}>Key Responsibilities (one per line)</label>
                  <textarea
                    style={
                      {
                        ...fieldInp,
                        height: 80,
                        resize: 'none',
                      } as React.CSSProperties
                    }
                    value={keyResponsibilities}
                    onChange={(e) => setKeyResponsibilities(e.target.value)}
                    placeholder="List key responsibilities…"
                  />
                </div>
              </div>
            </div>
          ) : (
            <CollapsedStep
              icon={<DetailsIcon />}
              label="Details"
              sub="Define the role and culture."
              onClick={() => setStep(1)}
            />
          )}

          {/* STEP 2 */}
          {step === 2 ? (
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px 10px',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: '#EEF0FB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ScheduleIcon />
                </div>
                <div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}
                  >
                    Schedule
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    Set dates, times, and pay
                  </div>
                </div>
              </div>
              <ActiveBadge />
              <div
                style={{
                  padding: '0 16px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <div>
                    <label style={lbl}>Start Date</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="MM-DD-YYYY"
                      pattern="[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}"
                      title="MM-DD-YYYY"
                      style={fieldInp}
                      value={startDateInput}
                      onChange={(e) => setStartDateInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={lbl}>End Date</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="MM-DD-YYYY"
                      pattern="[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}"
                      title="MM-DD-YYYY"
                      style={fieldInp}
                      value={endDateInput}
                      onChange={(e) => setEndDateInput(e.target.value)}
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <div>
                    <label style={lbl}>Start Time</label>
                    <input
                      type="time"
                      style={fieldInp}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={lbl}>End Time</label>
                    <input
                      type="time"
                      style={fieldInp}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={flexible}
                    onChange={(e) => setFlexible(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#1C32D2' }}
                  />
                  Schedule is flexible
                </label>
                <div>
                  <label style={lbl}>Rate per Day (CAD) *</label>
                  <input
                    style={fieldInp}
                    type="number"
                    value={ratePerDay}
                    onChange={(e) => setRatePerDay(e.target.value)}
                    placeholder="e.g. 2000"
                  />
                </div>
              </div>
            </div>
          ) : step > 2 ? (
            <CollapsedStep
              icon={<ScheduleIcon />}
              label="Schedule"
              sub="Set dates, times, and pay"
              onClick={() => setStep(2)}
            />
          ) : (
            <UpcomingStep
              icon={<ScheduleIcon />}
              label="Schedule"
              sub="Set dates, times, and pay"
            />
          )}

          {/* STEP 3 */}
          {step === 3 ? (
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px 10px',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: '#EEF0FB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <RequirementsIcon />
                </div>
                <div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}
                  >
                    Requirements
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    List mandatory licenses and experience
                  </div>
                </div>
              </div>
              <ActiveBadge />
              <div
                style={{
                  padding: '0 16px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div>
                  <label style={lbl}>Years of Experience</label>
                  <input
                    style={{ ...fieldInp, maxWidth: 200 }}
                    type="number"
                    value={yearsExp}
                    onChange={(e) => setYearsExp(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom: 10 }}>
                    Required Credentials
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {CREDENTIAL_OPTIONS.map((c) => {
                      const on = credentials.includes(c);
                      return (
                        <span
                          key={c}
                          onClick={() => toggle(c)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 12px',
                            borderRadius: 20,
                            cursor: 'pointer',
                            fontSize: 13,
                            userSelect: 'none',
                            background: on ? '#EEF0FB' : '#fff',
                            border: `1px solid ${on ? '#3B4FD8' : '#D0D5DD'}`,
                            color: on ? '#1C32D2' : '#374151',
                          }}
                        >
                          {c}
                          {on && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(c);
                              }}
                              style={{
                                fontSize: 14,
                                color: '#1C32D2',
                                lineHeight: 1,
                                marginLeft: 2,
                              }}
                            >
                              ×
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={travelReq}
                    onChange={(e) => setTravelReq(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#1C32D2' }}
                  />
                  Locum is required to travel to Clinic
                </label>
                {submitError && (
                  <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>
                    {submitError}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <UpcomingStep
              icon={<RequirementsIcon />}
              label="Requirements"
              sub="List mandatory licenses and experience"
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #F3F4F6',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              style={{
                padding: '10px 28px',
                background: '#fff',
                border: '1px solid #D0D5DD',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                color: '#0B0F1F',
                cursor: 'pointer',
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleDone}
              disabled={submitting}
              style={{
                padding: '10px 28px',
                background: submitting ? '#9CA3AF' : '#1C32D2',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                color: '#fff',
                cursor: submitting ? 'default' : 'pointer',
              }}
            >
              {submitting ? 'Publishing…' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function HostDashboard(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const router = useRouter();
  const { profileComplete, isLoading: authLoading, userId } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [activeNav, setActiveNav] = useState('postings');
  const [activeTab, setActiveTab] = useState<
    'active' | 'ongoing' | 'recent' | 'draft'
  >('active');
  const [showJobOverlay, setShowJobOverlay] = useState(false);

  // Data
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  // Applicants
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobApplications, setJobApplications] = useState<
    Record<string, ApplicationRecord[]>
  >({});
  const [loadingAppsFor, setLoadingAppsFor] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationRecord | null>(
    null,
  );
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Re-open
  const [reopenTarget, setReopenTarget] = useState<Job | null>(null);

  /** Profile from GET /api/host/profile (DB); loaded with jobs/stats on each dashboard entry. */
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [initialDashboardLoad, setInitialDashboardLoad] = useState(true);
  const hostFirst = profile?.contactFirstName ?? '';
  const hostLast = profile?.contactLastName ?? '';
  /** Was fallback `'H'` (meaningless “Host”); use contact initials, else clinic name, else `N`. */
  const hostInitial = computeAvatarInitials(
    profile?.contactFirstName,
    profile?.contactLastName,
    profile?.clinicName,
  );
  const verified = isCpsnsVerified(profile?.cpsnsNumber);
  const doctorLabel =
    hostFirst || hostLast ? `Dr ${hostFirst} ${hostLast}`.trim() : 'Doctor';
  const clinicName = profile?.clinicName || 'Welcome';
  const profilePct = hostProfileCompletionPct(profile);
  const profileAllStepsDone = profilePct === 100;
  const dashboardProfileTitle = !profileAllStepsDone
    ? 'Set up your profile to start posting'
    : verified
      ? 'Profile complete and verified'
      : 'Profile complete — CPSNS under verification';
  const dashboardProfileSubtitle = !profileAllStepsDone
    ? `${profilePct}% Completed`
    : verified
      ? '100% · CPSNS verified'
      : '100% · Awaiting manual CPSNS verification';

  /** Load host profile (Next route → DB) + jobs + stats (Nest → DB) in one pass. */
  const loadDashboardFromApi = useCallback(async () => {
    setLoadingData(true);
    setDataLoadError(null);
    try {
      const dashOpts = { skipAuthRedirectOn401: true } as const;
      const errs: string[] = [];
      const [profileResult, jobsResult, statsResult] = await Promise.allSettled([
        hostApi.getProfile(),
        hostApi.getJobs(dashOpts),
        hostApi.getDashboardStats(dashOpts),
      ]);
      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        setProfile(null);
        const pr = profileResult.reason;
        if (pr instanceof ApiHttpError && pr.status === 401) {
          errs.push(
            'Could not verify your session for this page. If the API was starting, try Refresh. Otherwise sign in again.',
          );
        } else {
          errs.push(
            pr instanceof Error ? pr.message : 'Could not load profile.',
          );
        }
      }
      if (jobsResult.status === 'fulfilled') {
        setJobs(jobsResult.value.jobs);
      } else {
        const r = jobsResult.reason;
        if (r instanceof ApiHttpError && r.status === 401) {
          errs.push('Could not load jobs (unauthorized or API unavailable).');
        } else {
          errs.push(r instanceof Error ? r.message : 'Could not load jobs.');
        }
      }
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else {
        const r = statsResult.reason;
        if (r instanceof ApiHttpError && r.status === 401) {
          errs.push(
            'Could not load dashboard stats (unauthorized or API unavailable).',
          );
        } else {
          errs.push(r instanceof Error ? r.message : 'Could not load stats.');
        }
      }
      if (errs.length) setDataLoadError([...new Set(errs)].join(' '));
    } finally {
      setLoadingData(false);
      setInitialDashboardLoad(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted || authLoading) return;
    if (profileComplete === false) router.replace('/host/setup');
  }, [mounted, profileComplete, authLoading, router]);
  // After redirect (or refresh), wait for Nest JWT, then fetch profile + jobs + stats from APIs.
  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!getToken()) {
      setProfile(null);
      setInitialDashboardLoad(false);
      router.replace('/auth');
      return;
    }
    void loadDashboardFromApi();
  }, [mounted, authLoading, userId, loadDashboardFromApi, router]);


  // Filtered job lists
  const today = new Date();
  const activePosts = jobs.filter((j) => j.status === 'ACTIVE');
  const draftJobs = jobs.filter((j) => j.status === 'DRAFT');
  const ongoingJobs = jobs.filter(
    (j) =>
      j.status !== 'DRAFT' &&
      j.startDate &&
      j.endDate &&
      new Date(j.startDate) <= today &&
      new Date(j.endDate) >= today,
  );
  const recentJobs = jobs.filter(
    (j) =>
      j.status !== 'DRAFT' &&
      (j.status === 'FILLED' ||
        j.status === 'CANCELLED' ||
        j.status === 'EXPIRED' ||
        (j.endDate && new Date(j.endDate) < today)),
  );

  const tabJobs =
    activeTab === 'active'
      ? activePosts
      : activeTab === 'ongoing'
        ? ongoingJobs
        : activeTab === 'recent'
          ? recentJobs
          : draftJobs;

  // Stats display
  const statsDisplay = [
    {
      label: 'Total Jobs Posted',
      value: stats?.totalJobsPosted ?? 0,
      comp: stats?.comparisons.totalJobsPosted,
    },
    {
      label: 'Active Jobs',
      value: stats?.activeJobs ?? 0,
      comp: stats?.comparisons.activeJobs,
    },
    {
      label: 'Completed Jobs',
      value: stats?.completedJobs ?? 0,
      comp: stats?.comparisons.completedJobs,
    },
    {
      label: 'Applications',
      value: stats?.applications ?? 0,
      comp: stats?.comparisons.applications,
    },
  ];

  // Handlers
  async function handleToggleApplicants(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    if (!jobApplications[jobId]) {
      setLoadingAppsFor(jobId);
      try {
        const result = await hostApi.getApplications(jobId);
        setJobApplications((prev) => ({
          ...prev,
          [jobId]: result.applications,
        }));
      } finally {
        setLoadingAppsFor(null);
      }
    }
  }

  function handleApplicantClick(app: ApplicationRecord, jobId: string) {
    setSelectedApp(app);
    setSelectedJobId(jobId);
  }

  function handleShortlisted(appId: string) {
    if (!selectedJobId) return;
    setJobApplications((prev) => ({
      ...prev,
      [selectedJobId]: (prev[selectedJobId] ?? []).map((a) =>
        a.id === appId ? { ...a, status: 'SHORTLISTED' as const } : a,
      ),
    }));
    if (selectedApp?.id === appId)
      setSelectedApp((prev: ApplicationRecord | null) =>
        prev ? { ...prev, status: 'SHORTLISTED' as const } : null,
      );
  }

  async function handleReopen(extra: number) {
    if (!reopenTarget) return;
    await hostApi.reopenJob(reopenTarget.id, extra);
    setReopenTarget(null);
    loadDashboardFromApi();
  }

  if (!mounted || profileComplete === false || authLoading || initialDashboardLoad) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif',
          background: '#fff',
          color: '#64748b',
          fontSize: 14,
        }}
      >
        Loading dashboard…
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
        background: '#fff',
      }}
    >
      {/* NAVBAR */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: NAVBAR_HEIGHT,
          zIndex: 100,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          background: '#FFFFFF',
          borderBottom: '2px solid rgba(0,0,0,0.1)',
        }}
      >
        <Link
          href="/home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
          }}
        >
          <Image
            src="/logo.png"
            alt=""
            width={40}
            height={40}
            priority
            style={{ objectFit: 'contain' }}
          />
          <span
            style={{
              fontFamily: 'Gilroy-Black, Outfit, sans-serif',
              fontWeight: 400,
              fontSize: 28,
              lineHeight: '28px',
              textTransform: 'capitalize',
            }}
          >
            <span style={{ color: '#0F2A7A' }}>Locum </span>
            <span style={{ color: '#30C6C6' }}>Link</span>
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28 }}>
            <BellIcon />
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(58,101,219,0.07)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'Hanken Grotesk, Inter, sans-serif',
                fontWeight: 700,
                fontSize: 16,
                color: '#0F2AAE',
              }}
            >
              {hostInitial}
            </span>
          </div>
        </div>
      </nav>

      {/* BODY */}
      <div
        style={{
          display: 'flex',
          height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
          marginTop: NAVBAR_HEIGHT,
          overflow: 'hidden',
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            position: 'relative',
            flexShrink: 0,
            width: 232,
            height: '100%',
            overflowY: 'auto',
            boxSizing: 'border-box',
            background: '#F4F6FB',
            boxShadow: 'inset 0px 4px 22px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 10px 28px',
            gap: 14,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top:
                8 +
                27 +
                12 +
                NAV_ITEMS.findIndex((n) => n.id === activeNav) * 38 +
                5,
              width: 6,
              height: 33,
              background: 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
              borderRadius: '0px 8px 8px 0px',
              transition: 'top 0.2s ease',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              width: '100%',
            }}
          >
            <div style={{ paddingLeft: 10 }}>
              <span
                style={{
                  fontFamily: 'Hanken Grotesk, Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: 14,
                  lineHeight: '27px',
                  color: '#6B7280',
                  textTransform: 'capitalize',
                }}
              >
                Locum Management
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {NAV_ITEMS.map((item) => {
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveNav(item.id);
                      router.push(item.href);
                    }}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      maxWidth: 212,
                      height: isActive ? 44 : 20,
                      padding: isActive
                        ? '12px 12px 12px 8px'
                        : '0px 12px 0px 8px',
                      background: isActive
                        ? 'rgba(130,173,237,0.2)'
                        : 'transparent',
                      borderRadius: isActive ? 4 : 16,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {item.id === 'postings' && <FileIcon active={isActive} />}
                      {item.id === 'profile' && (
                        <ProfileIcon active={isActive} />
                      )}
                      {item.id === 'messages' && (
                        <MessageIcon active={isActive} />
                      )}
                      {item.id === 'resources' && (
                        <BookIcon active={isActive} />
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: 'Gilroy-Medium, Inter, sans-serif',
                        fontWeight: 400,
                        fontSize: 16,
                        lineHeight: '100%',
                        textTransform: 'capitalize',
                        whiteSpace: 'nowrap',
                        ...(isActive
                          ? {
                              background:
                                'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                            }
                          : { color: 'rgba(2,7,27,0.9)' }),
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ width: '100%', height: 1, background: '#DBE1E8' }} />
        </aside>

        {/* MAIN */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            background: '#F7F8FA',
            padding: '19px 24px 48px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: 1180,
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    width: 'fit-content',
                    padding: '8px 12px',
                    background: 'rgba(171,230,234,0.1)',
                    borderRadius: 50,
                  }}
                >
                  {verified && <ShieldIcon />}
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      fontSize: 18,
                      lineHeight: '120%',
                      color: '#309BB7',
                      textTransform: 'capitalize',
                    }}
                  >
                    {doctorLabel}
                  </span>
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                    fontSize: 30,
                    lineHeight: '120%',
                    color: '#0B0F1F',
                    textTransform: 'capitalize',
                  }}
                >
                  {clinicName}
                </h1>
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    fontSize: 16,
                    lineHeight: '150%',
                    color: '#6B7280',
                    textTransform: 'capitalize',
                  }}
                >
                  Define and manage organizational, hierarchy, departments, and
                  relationships with AI-Powered insights
                </p>
              </div>

              {dataLoadError && (
                <div
                  role="alert"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 13,
                    color: '#991B1B',
                    lineHeight: 1.45,
                  }}
                >
                  {dataLoadError}
                </div>
              )}

              {/* Stats */}
              <div
                style={{
                  background: '#fff',
                  border: '1px solid rgba(217,217,217,0.8)',
                  borderRadius: 10,
                  padding: 24,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  {statsDisplay.map((stat, i) => (
                    <div
                      key={stat.label}
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            fontSize: 18,
                            lineHeight: '140%',
                            color: '#4A4A4A',
                          }}
                        >
                          {stat.label}
                        </span>
                        <span
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 600,
                            fontSize: 32,
                            lineHeight: '26px',
                            color: '#000',
                          }}
                        >
                          {loadingData ? '–' : stat.value}
                        </span>
                        {stat.comp && !loadingData && (
                          <CompBadge
                            change={stat.comp.change}
                            direction={stat.comp.direction}
                            period={stat.comp.period}
                          />
                        )}
                      </div>
                      {i < statsDisplay.length - 1 && (
                        <div
                          style={{
                            width: 1,
                            alignSelf: 'stretch',
                            background: '#D9D9D9',
                            marginLeft: 12,
                            marginRight: 12,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Profile banner */}
            <div
              style={{
                background: 'rgba(209,213,219,0.3)',
                borderRadius: 10,
                height: 104,
                padding: '0 27px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: 'rgba(15,42,175,0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path
                      d="M8 4h12l4 4v16H4V4h4Z"
                      stroke="#803BDB"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 12h10M9 16h6"
                      stroke="#803BDB"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="5"
                      fill="#72BC7A"
                      stroke="#72BC7A"
                      strokeWidth="1"
                    />
                    <path
                      d="M17.5 20l2 2 3-3"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <span
                    style={{
                      fontFamily: 'Gilroy-Medium, Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: 22,
                      lineHeight: '100%',
                      color: '#151414',
                    }}
                  >
                    {dashboardProfileTitle}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Gilroy-Medium, Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: 18,
                      lineHeight: '100%',
                      color: '#606061',
                    }}
                  >
                    {dashboardProfileSubtitle}
                  </span>
                </div>
              </div>
              <button
                onClick={() => router.push('/host/profile')}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  width: 150,
                  height: 41,
                  background: '#fff',
                  border: '1px solid #D0D5DD',
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              >
                <UserEditIcon />
                <span
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500,
                    fontSize: 18,
                    lineHeight: '140%',
                    color: '#0B0F1F',
                  }}
                >
                  Edit Profile
                </span>
              </button>
            </div>

            {/* Tabs + Post New Job */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: 52,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          boxSizing: 'border-box',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 12,
                          height: 52,
                          borderBottom: isActive
                            ? '2px solid #000'
                            : '2px solid transparent',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 600,
                            fontSize: 16,
                            lineHeight: '24px',
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase',
                            color: isActive ? '#000' : '#636364',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    if (!verified) {
                      window.alert(
                        'Not verified yet. An admin must verify your CPSNS number before you can post a job.',
                      );
                      return;
                    }
                    setShowJobOverlay(true);
                  }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    height: 45,
                    width: 172,
                    background:
                      'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                    borderRadius: 8,
                    flexShrink: 0,
                  }}
                >
                  <PlusIcon />
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 500,
                      fontSize: 18,
                      lineHeight: '140%',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Post New Job
                  </span>
                </button>
              </div>
              <div style={{ width: 428, height: 1, background: '#A7A8AA' }} />

              {/* Tab content */}
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {loadingData && (
                  <div
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      fontSize: 13,
                      color: '#9CA3AF',
                    }}
                  >
                    Loading…
                  </div>
                )}

                {!loadingData && tabJobs.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingTop: 80,
                      gap: 12,
                    }}
                  >
                    <EmptyIllustration />
                    <span
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 600,
                        fontSize: 18,
                        color: '#0B0F1F',
                        marginTop: 8,
                      }}
                    >
                      {activeTab === 'draft' ? 'No drafts yet' : 'No posts yet'}
                    </span>
                    <span
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 400,
                        fontSize: 14,
                        color: '#6B7280',
                      }}
                    >
                      {activeTab === 'active' &&
                        'You have not posted any active jobs yet'}
                      {activeTab === 'ongoing' &&
                        'No jobs are currently ongoing'}
                      {activeTab === 'recent' && 'No recent or completed jobs'}
                      {activeTab === 'draft' && 'No draft jobs saved'}
                    </span>
                  </div>
                )}

                {!loadingData &&
                  tabJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      expandedJobId={expandedJobId}
                      applications={jobApplications}
                      loadingAppsFor={loadingAppsFor}
                      onToggleApplicants={handleToggleApplicants}
                      onApplicantClick={handleApplicantClick}
                      onViewAll={(jobId) =>
                        router.push(`/host/applicants/${jobId}`)
                      }
                      onReOpen={(j) => setReopenTarget(j)}
                      onEdit={(j) => router.push(`/host/jobs/${j.id}/edit`)}
                    />
                  ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* JOB POSTING OVERLAY */}
      {showJobOverlay && (
        <JobPostingOverlay
          onClose={() => setShowJobOverlay(false)}
          onSuccess={() => {
            setShowJobOverlay(false);
            loadDashboardFromApi();
          }}
        />
      )}

      {/* APPLICANT SIDE PANEL */}
      {selectedApp && selectedJobId && (
        <ApplicantSidePanel
          app={selectedApp}
          jobId={selectedJobId}
          onClose={() => {
            setSelectedApp(null);
            setSelectedJobId(null);
          }}
          onShortlisted={handleShortlisted}
        />
      )}

      {/* REOPEN MODAL */}
      {reopenTarget && (
        <ReOpenModal
          job={reopenTarget}
          onConfirm={handleReopen}
          onCancel={() => setReopenTarget(null)}
        />
      )}
    </div>
  );
}
