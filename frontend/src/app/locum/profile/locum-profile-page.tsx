'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { locumApi, uploadFile } from '@/lib/api';
import { buildLocumSavePayload } from '@/lib/locumProfilePayload';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { LocumProfile } from '@/types';
import { isCpsnsVerified } from '@/lib/cpsnsVerify';

const NAV = [
  { label: 'Browse Opportunities', href: '/locum/browse',    icon: <NavIcon name="browse"    /> },
  { label: 'My Applications',      href: '/locum/dashboard', icon: <NavIcon name="postings"  /> },
  { label: 'Profile',              href: '/locum/profile',   icon: <NavIcon name="profile"   /> },
  { label: 'Messages',             href: '/locum/messages',  icon: <NavIcon name="messages"  /> },
  { label: 'Resources',            href: '/locum/resources', icon: <NavIcon name="resources" /> },
];

const SPECIALITY_OPTIONS = [
  'Family Physician', 'Internal medicine', 'Emergency', 'ENT',
  'General Practice', 'Emergency Medicine', 'Anaesthetics', 'Paediatrics',
];

type VerificationStatus = 'pending' | 'under-review' | 'verified';

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  minHeight: 37,
  border: '1px solid #D0D5DD',
  borderRadius: 6,
  fontSize: 13,
  color: '#0f1523',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500,
  color: '#374151', marginBottom: 5,
};

// ── Step status helpers ──────────────────────────────────────────────────────
type StepStatus = 'complete' | 'active' | 'incomplete' | 'upcoming';

function stepBorderColor(s: StepStatus) {
  if (s === 'complete')   return '#16a34a'; // green
  if (s === 'active')     return '#3B4FD8'; // blue
  if (s === 'incomplete') return '#f97316'; // orange
  return '#e2e5ee';                          // grey
}
function stepCircleBg(s: StepStatus) {
  if (s === 'complete')   return '#16a34a';
  if (s === 'active')     return '#3B4FD8';
  if (s === 'incomplete') return '#f97316';
  return '#e2e5ee';
}
function stepTextColor(s: StepStatus) {
  if (s === 'complete')   return '#16a34a';
  if (s === 'active')     return '#3B4FD8';
  if (s === 'incomplete') return '#f97316';
  return '#8892a4';
}

// ── Verification banner ──────────────────────────────────────────────────────
function VerificationBanner({ status }: { status: VerificationStatus }) {
  const config = {
    pending: {
      img: '/profile-incomplete.png',
      title: 'Profile submitted — pending review',
      sub: 'We will notify you once your profile has been reviewed.',
      bg: '#FFFBEB', border: '#FDE68A', titleColor: '#92400E', subColor: '#B45309',
    },
    'under-review': {
      img: '/profile-underverification.png',
      title: 'CPSNS not verified yet',
      sub: 'Your profile is complete, but your CPSNS number must match our verified list before you can apply to jobs.',
      bg: '#EFF6FF', border: '#BFDBFE', titleColor: '#1E40AF', subColor: '#3B82F6',
    },
    verified: {
      img: '/profile-verified.png',
      title: 'Profile verified',
      sub: 'You are verified and can now apply to locum opportunities.',
      bg: '#F3F4F6',
      border: '#E5E7EB',
      titleColor: '#0f1523',
      subColor: '#6B7280',
    },
  }[status];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: config.bg, border: `1px solid ${config.border}`,
      borderRadius: 8, padding: '12px 16px', marginBottom: 20,
    }}>
      <img src={config.img} alt="" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: config.titleColor }}>{config.title}</div>
        <div style={{ fontSize: 12, color: config.subColor }}>{config.sub}</div>
      </div>
    </div>
  );
}

export default function LocumProfilePage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const [activeStep, setActiveStep] = useState(1);
  const [visited, setVisited] = useState<Set<number>>(new Set([1]));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');

  // ── Form state ──────────────────────────────────────────────────────────
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [cpsns,       setCpsns]       = useState('');
  const [summary,     setSummary]     = useState('');
  const [speciality,  setSpeciality]  = useState('');
  const [specialityTags, setSpecialityTags] = useState<string[]>([]);
  const [addr1,       setAddr1]       = useState('');
  const [addr2,       setAddr2]       = useState('');
  const [postalCode,  setPostalCode]  = useState('');
  const [city,        setCity]        = useState('');
  const [province,    setProvince]    = useState('');
  const [licenseFile, setLicenseFile] = useState('');
  const [resumeFile,  setResumeFile]  = useState('');
  const [extraFile,   setExtraFile]   = useState('');
  const [licenseViewUrl, setLicenseViewUrl] = useState<string | null>(null);
  const [resumeViewUrl, setResumeViewUrl] = useState<string | null>(null);
  const [extraViewUrl, setExtraViewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const licenseRef = useRef<HTMLInputElement>(null);
  const resumeRef  = useRef<HTMLInputElement>(null);
  const extraRef   = useRef<HTMLInputElement>(null);

  // ── Load profile from API ────────────────────────────────────────────────
  useEffect(() => {
    locumApi.getProfile()
      .then((data) => {
        const typed = data as unknown as {
          exists: boolean;
          profile: LocumProfile | null;
        };
        if (!typed.exists || !typed.profile) return;
        const p = typed.profile;
        setFirstName(p.firstName   ?? '');
        setLastName(p.lastName     ?? '');
        setCpsns(p.cpsnsNumber     ?? '');
        setSummary(p.professionalSummary ?? '');
        setSpeciality(p.specialization ?? '');
        setSpecialityTags(
          p.specialization
            ? p.specialization.split(',').map((s: string) => s.trim()).filter(Boolean)
            : []
        );
        setAddr1(p.address1  ?? '');
        setAddr2(p.address2  ?? '');
        setPostalCode(p.postalCode ?? '');
        setCity(p.city       ?? '');
        setProvince(p.province ?? '');
        const lf = p.licenseFile ?? p.licenseFileName ?? '';
        const rf = p.resumeFile ?? p.resumeFileName ?? '';
        const xf = p.extraFile ?? p.extraFileName ?? '';
        setLicenseFile(lf);
        setResumeFile(rf);
        setExtraFile(xf);
        setLicenseViewUrl(/^https?:\/\//.test(lf) ? lf : null);
        setResumeViewUrl(/^https?:\/\//.test(rf) ? rf : null);
        setExtraViewUrl(/^https?:\/\//.test(xf) ? xf : null);
      })
      .catch(() => setLoadError('Could not load profile data.'));
  }, []);

  // ── Step completion checks ───────────────────────────────────────────────
  const step1Done = !!(firstName && lastName && cpsns && summary && specialityTags.length);
  const step2Done = !!(addr1 && postalCode && city && province);
  const step3Done = !!(licenseFile && resumeFile);
  const stepDone  = [step1Done, step2Done, step3Done];

  const completedCount = stepDone.filter(Boolean).length;
  const progressPct    = Math.round((completedCount / 3) * 100);
  const allStepsDone = step1Done && step2Done && step3Done;
  const profileVerificationStatus: VerificationStatus = allStepsDone
    ? isCpsnsVerified(cpsns)
      ? 'verified'
      : 'under-review'
    : 'pending';

  function getStatus(n: number): StepStatus {
    const idx = n - 1;
    if (activeStep === n)    return 'active';
    if (stepDone[idx])       return 'complete';
    if (visited.has(n))      return 'incomplete';
    return 'upcoming';
  }

  function goToStep(n: number) {
    setVisited((v) => new Set([...v, n]));
    setActiveStep(n);
  }

  // ── Save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await locumApi.saveProfile(
        buildLocumSavePayload(
          {
            firstName,
            lastName,
            cpsnsNumber: cpsns,
            professionalSummary: summary,
            specialization: specialityTags.join(', '),
            address1: addr1,
            address2: addr2,
            postalCode,
            city,
            province,
          },
          { licenseFile, resumeFile, extraFile },
        ),
      );
      setSaved(true);
    } catch {
      setLoadError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    { n: 1, label: 'Basic Information', sub: 'Your personal identity' },
    { n: 2, label: 'Location', sub: 'Location & branding' },
    { n: 3, label: 'Relevant Documents', sub: 'Licence & documents' },
  ];

  const sectionBorder = (n: number) => {
    const s = getStatus(n);
    return `1px solid ${stepBorderColor(s)}`;
  };

  return (
    <DashLayout
      navItems={NAV}
      activeHref="/locum/profile"
      topbarFirstName={firstName}
      topbarLastName={lastName}
    >
      {/* ── Page header ── */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f1523', marginBottom: 3 }}>
        Welcome
      </h1>
      <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 16 }}>
        Define And Manage Organizational, Hierarchy, Departments, And Relationships With AI-Powered Insights
      </p>

      {/* ── Verification banner (CPSNS allow-list) once profile steps are complete ── */}
      {allStepsDone ? (
        <VerificationBanner status={profileVerificationStatus} />
      ) : null}

      {/* ── Step overview (Figma) — above % complete ── */}
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          marginBottom: 20,
          fontFamily: 'Inter, var(--font-family-body, DM Sans), sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            minHeight: 48,
            marginBottom: 10,
          }}
        >
          {steps.flatMap((s, i) => {
            const status = getStatus(s.n);
            const isDone = status === 'complete';
            const isActive = status === 'active';
            const showFilled = isDone || isActive;
            const stepBlock = (
              <div
                key={s.n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flex: '1 1 220px',
                  minWidth: 200,
                  cursor: 'pointer',
                }}
                onClick={() => goToStep(s.n)}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isDone
                      ? '#16a34a'
                      : isActive
                        ? '#1522A6'
                        : 'transparent',
                    border: showFilled
                      ? 'none'
                      : '1px solid rgba(21, 20, 20, 0.4)',
                    boxSizing: 'border-box',
                    color: showFilled ? '#fff' : '#6B7280',
                    fontSize: 18,
                    fontWeight: 500,
                    lineHeight: 1,
                  }}
                >
                  {isDone ? '✓' : s.n}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 500,
                      lineHeight: 1,
                      color: '#0B0F1F',
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 400,
                      lineHeight: 1.4,
                      color: '#6B7280',
                    }}
                  >
                    {s.sub}
                  </div>
                </div>
              </div>
            );
            if (i < steps.length - 1) {
              return [
                stepBlock,
                <span
                  key={`sep-${s.n}`}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    color: '#210840',
                    opacity: 0.55,
                  }}
                  aria-hidden
                >
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ transform: 'rotate(-90deg)' }}
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>,
              ];
            }
            return [stepBlock];
          })}
        </div>

        {/* Single progress: label + gradient track (6px) + divider */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#8892a4',
            marginBottom: 4,
          }}
        >
          <span>{progressPct}% completed</span>
        </div>
        <div style={{ width: '100%' }}>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: '#E5E7EB',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPct}%`,
                borderRadius: 3,
                background:
                  progressPct === 100
                    ? '#16a34a'
                    : 'linear-gradient(270deg, #3A65DB 0%, #1B31D2 100%)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div
            style={{
              marginTop: 8,
              borderTop: '1px solid #D1D5DB',
              width: '100%',
            }}
          />
        </div>
      </div>

      {loadError && (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{loadError}</div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Step 1 — Basic Information                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div
        onClick={() => goToStep(1)}
        style={{
          background: '#fff', border: sectionBorder(1),
          borderRadius: 8, padding: 20, marginBottom: 16, cursor: 'pointer',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              opacity: 1,
            }}
          >
            <Image
              src="/basic-information.png"
              alt=""
              width={24}
              height={24}
              style={{ objectFit: 'cover' }}
            />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#0f1523' }}>
            Basic Information
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
          <div>
            <label style={lbl}>First Name</label>
            <input
              style={inp} value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Enter first name"
            />
          </div>
          <div>
            <label style={lbl}>Last Name</label>
            <input
              style={inp} value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Enter last name"
            />
          </div>
        </div>
        {/* Same width as First name column (half row) + matching control height */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={lbl}>CPSNS Number</label>
            <input
              style={inp}
              value={cpsns}
              onChange={(e) => setCpsns(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Enter CPSNS number"
            />
          </div>
          <div aria-hidden />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={lbl}>Professional Summary</label>
            <textarea
              style={
                {
                  ...inp,
                  minHeight: 37,
                  height: 68,
                  resize: 'none',
                  lineHeight: 1.45,
                } as React.CSSProperties
              }
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="About you"
            />
          </div>
          <div aria-hidden />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 10,
          }}
        >
          <div>
            <label style={lbl}>Speciality</label>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <select
                style={{
                  ...inp,
                  minHeight: 37,
                  height: 37,
                  paddingRight: 32,
                  appearance: 'none',
                }}
                value=""
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && !specialityTags.includes(v)) {
                    setSpecialityTags((t) => [...t, v]);
                  }
                  e.target.selectedIndex = 0;
                }}
              >
                <option value="">Pick Speciality</option>
                {SPECIALITY_OPTIONS.filter((o) => !specialityTags.includes(o)).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  fontSize: 10,
                  color: '#000',
                }}
              >
                ▼
              </span>
            </div>
          </div>
          <div aria-hidden />
        </div>
        <div style={{ marginBottom: 0 }}>
          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {specialityTags.map((tag) => (
              <span key={tag} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 20,
                background: '#eef0fb', border: '1px solid #3B4FD8',
                color: '#3B4FD8', fontSize: 12,
              }}>
                {tag}
                <button
                  onClick={(e) => { e.stopPropagation(); setSpecialityTags((t) => t.filter((x) => x !== tag)); }}
                  style={{ background: 'none', border: 'none', color: '#8892a4', cursor: 'pointer', padding: 0, fontSize: 13 }}
                >×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Step 2 — Location                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div
        onClick={() => goToStep(2)}
        style={{
          background: '#fff', border: sectionBorder(2),
          borderRadius: 8, padding: 20, marginBottom: 16, cursor: 'pointer',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              opacity: 1,
            }}
          >
            <Image
              src="/location.png"
              alt=""
              width={24}
              height={24}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#0f1523' }}>
            Location
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Address Line 1</label>
            <input style={inp} value={addr1} onChange={(e) => setAddr1(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Location Address Line 1" />
          </div>
          <div>
            <label style={lbl}>Address Line 2</label>
            <input style={inp} value={addr2} onChange={(e) => setAddr2(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Location Address Line 2" />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Postal Code</label>
          <input style={{ ...inp, width: '50%' }} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Enter valid 6 digit code" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={lbl}>City</label>
            <input style={inp} value={city} onChange={(e) => setCity(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Add City" />
          </div>
          <div>
            <label style={lbl}>Province</label>
            <input style={inp} value={province} onChange={(e) => setProvince(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Add Province" />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Step 3 — Relevant Documents                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div
        onClick={() => goToStep(3)}
        style={{
          background: '#fff', border: sectionBorder(3),
          borderRadius: 8, padding: 20, marginBottom: 16, cursor: 'pointer',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              opacity: 1,
            }}
          >
            <Image
              src="/relevant-docs.png"
              alt=""
              width={24}
              height={24}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#0f1523' }}>
            Relevant Documents
          </span>
        </div>

        {/* Docs row */}
        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Docs</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {/* CPSNS License */}
          <div
            onClick={(e) => { e.stopPropagation(); licenseRef.current?.click(); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: licenseFile ? '1px solid #3B4FD8' : '1px solid #e2e5ee',
              borderRadius: 6, padding: '9px 12px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
              <Image
                src="/document-link.png"
                alt=""
                width={24}
                height={24}
                style={{ flexShrink: 0, opacity: 1, objectFit: 'contain' }}
              />
              <span style={{ fontSize: 13, color: licenseFile ? '#3B4FD8' : '#8892a4' }}>
                {uploading === 'license'
                  ? 'Uploading…'
                  : licenseFile
                    ? licenseFile.split('/').pop()
                    : 'CPSNS License'}
              </span>
              {licenseViewUrl ? (
                <a
                  href={licenseViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 11, color: '#3B4FD8', flexShrink: 0 }}
                >
                  View
                </a>
              ) : null}
            </div>
            <span style={{ color: '#8892a4', fontSize: 14 }}>›</span>
          </div>
          <input
            ref={licenseRef}
            type="file"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading('license');
              try {
                const result = await uploadFile(file, 'locum/license');
                setLicenseFile(result.path);
                setLicenseViewUrl(result.signedUrl);
              } catch {
                alert('Upload failed. Try again.');
              } finally {
                setUploading(null);
                e.target.value = '';
              }
            }}
          />

          {/* Resume */}
          <div
            onClick={(e) => { e.stopPropagation(); resumeRef.current?.click(); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: resumeFile ? '1px solid #3B4FD8' : '1px solid #e2e5ee',
              borderRadius: 6, padding: '9px 12px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
              <Image
                src="/document-link.png"
                alt=""
                width={24}
                height={24}
                style={{ flexShrink: 0, opacity: 1, objectFit: 'contain' }}
              />
              <span style={{ fontSize: 13, color: resumeFile ? '#3B4FD8' : '#8892a4' }}>
                {uploading === 'resume'
                  ? 'Uploading…'
                  : resumeFile
                    ? resumeFile.split('/').pop()
                    : 'Resume'}
              </span>
              {resumeViewUrl ? (
                <a
                  href={resumeViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 11, color: '#3B4FD8', flexShrink: 0 }}
                >
                  View
                </a>
              ) : null}
            </div>
            <span style={{ color: '#8892a4', fontSize: 14 }}>›</span>
          </div>
          <input
            ref={resumeRef}
            type="file"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading('resume');
              try {
                const result = await uploadFile(file, 'locum/resume');
                setResumeFile(result.path);
                setResumeViewUrl(result.signedUrl);
              } catch {
                alert('Upload failed. Try again.');
              } finally {
                setUploading(null);
                e.target.value = '';
              }
            }}
          />
        </div>

        {/* Additional Docs */}
        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Additional Docs</div>
        <p style={{ fontSize: 12, color: '#8892a4', margin: '0 0 8px' }}>-Cover letter, reference letters, etc</p>
        <div
          onClick={(e) => { e.stopPropagation(); extraRef.current?.click(); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: extraFile ? '1px solid #3B4FD8' : '1px solid #e2e5ee',
            borderRadius: 6, padding: '9px 12px', cursor: 'pointer', width: '48%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
            <Image
              src="/document-link.png"
              alt=""
              width={24}
              height={24}
              style={{ flexShrink: 0, opacity: 1, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 13, color: extraFile ? '#3B4FD8' : '#8892a4' }}>
              {uploading === 'extra'
                ? 'Uploading…'
                : extraFile
                  ? extraFile.split('/').pop()
                  : 'Add'}
            </span>
            {extraViewUrl ? (
              <a
                href={extraViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 11, color: '#3B4FD8', flexShrink: 0 }}
              >
                View
              </a>
            ) : null}
          </div>
          <span style={{ color: '#8892a4', fontSize: 14 }}>›</span>
        </div>
        <input
          ref={extraRef}
          type="file"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading('extra');
            try {
              const result = await uploadFile(file, 'locum/extra');
              setExtraFile(result.path);
              setExtraViewUrl(result.signedUrl);
            } catch {
              alert('Upload failed. Try again.');
            } finally {
              setUploading(null);
              e.target.value = '';
            }
          }}
        />
      </div>

      {/* ── Save feedback ── */}
      {saved && (
        <div style={{
          background: '#F0FDF4', border: '1px solid #BBF7D0',
          borderRadius: 6, padding: '10px 14px', marginBottom: 12,
          fontSize: 13, color: '#166534',
        }}>✓ Profile saved successfully.</div>
      )}

      {/* ── Done button ── */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '10px 28px',
          background: saving ? '#8892a4' : '#3B4FD8',
          color: '#fff', border: 'none', borderRadius: 6,
          fontSize: 14, fontWeight: 500,
          cursor: saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Saving…' : 'Done'}
      </button>
    </DashLayout>
  );
}