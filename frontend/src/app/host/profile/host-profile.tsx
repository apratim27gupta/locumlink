'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { useHostProfile } from '@/hooks/useHostProfile';
import type { HostProfile } from '@/types';
import { hostProfileCompletionPct } from '@/lib/hostProfileCompletion';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { isCpsnsVerified } from '@/lib/cpsnsVerify';

const NAV = [
  {
    label: 'My Postings',
    href: '/host/dashboard',
    icon: <NavIcon name="postings" />,
  },
  { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile" /> },
  {
    label: 'Messages',
    href: '/host/messages',
    icon: <NavIcon name="messages" />,
  },
  {
    label: 'Resources',
    href: '/host/resources',
    icon: <NavIcon name="resources" />,
  },
];

// ── shared styles ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d0d4e4',
  borderRadius: 6,
  fontSize: 13,
  color: '#0f1523',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 5,
};

const AMENITY_OPTIONS = [
  'On-site Parking',
  'Digital X-Ray',
  'Laboratory services',
  'Pharmacy nearby',
  'Cafeteria',
  'Private Office Space',
  'Admin Support',
  'IT Support',
];

// ── step status helpers ───────────────────────────────────────────────────────
type StepStatus = 'upcoming' | 'active' | 'complete' | 'incomplete';
function stepBorderColor(s: StepStatus) {
  if (s === 'active') return '#3B4FD8';
  if (s === 'complete') return '#16a34a';
  if (s === 'incomplete') return '#f97316';
  return '#e2e5ee';
}
function stepCircleBg(s: StepStatus) {
  if (s === 'active') return '#3B4FD8';
  if (s === 'complete') return '#16a34a';
  if (s === 'incomplete') return '#f97316';
  return '#e2e5ee';
}
function stepLabelColor(s: StepStatus) {
  if (s === 'active') return '#3B4FD8';
  if (s === 'complete') return '#16a34a';
  if (s === 'incomplete') return '#f97316';
  return '#8892a4';
}

function sectionCard(
  highlighted: boolean,
  opts?: { gap?: number; height?: number; borderRadius?: number },
): React.CSSProperties {
  return {
    background: '#fff',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '32px 24px',
    gap: opts?.gap ?? 24,
    width: 1180,
    height: opts?.height ?? 700,
    border: `1px solid ${highlighted ? '#3B4FD8' : '#D9D9D9'}`,
    borderRadius: opts?.borderRadius ?? 10,
    marginBottom: 0,
  };
}

export default function HostProfilePage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  // ── API hook ──────────────────────────────────────────────────────────────
  const { profile, loading, saveProfile, saving } = useHostProfile();
  const verified = isCpsnsVerified(profile?.cpsnsNumber);

  // ── Local form state ──────────────────────────────────────────────────────
  // Step 1 — Basic Info
  const [clinicName, setClinicName] = useState('');
  const [contactFirst, setContactFirst] = useState('');
  const [contactLast, setContactLast] = useState('');
  const [hostFirst, setHostFirst] = useState('');
  const [hostLast, setHostLast] = useState('');
  const [cpsns, setCpsns] = useState('');
  const [licenseFile, setLicenseFile] = useState<string | null>(null);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialtyInput, setSpecialtyInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 — Location
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [postal, setPostal] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');

  // Step 3 — Practice Details (profile-page-only fields)
  const [practiceType, setPracticeType] = useState('');
  const [numPhysicians, setNumPhysicians] = useState('');
  const [emr, setEmr] = useState('');
  const [patientVol, setPatientVol] = useState('');
  const [clinicDesc, setClinicDesc] = useState('');

  // Step 4 — Services
  const [amenities, setAmenities] = useState<string[]>([]);
  const [accommodation, setAccommodation] = useState(false);

  // UI
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [activeStep, setActiveStep] = useState(1);
  const [visited, setVisited] = useState<Set<number>>(new Set([1]));

  // ── Pre-fill form when API data arrives ──────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    setClinicName(profile.clinicName ?? '');
    setContactFirst(profile.contactFirstName ?? '');
    setContactLast(profile.contactLastName ?? '');
    // Setup stores host doctor under contactFirstName/LastName
    setHostFirst(profile.contactFirstName ?? '');
    setHostLast(profile.contactLastName ?? '');
    setCpsns(profile.cpsnsNumber ?? '');
    setLicenseFile(profile.licenseFile ?? null);
    setSpecialties(
      profile.speciality
        ? profile.speciality
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    );
    setAddr1(profile.address1 ?? '');
    setAddr2(profile.address2 ?? '');
    setPostal(profile.postalCode ?? '');
    setCity(profile.city ?? '');
    setProvince(profile.province ?? '');
    setPracticeType(profile.practiceType ?? '');
    setNumPhysicians(profile.numPhysicians ?? '');
    setEmr(profile.emr ?? '');
    setPatientVol(profile.patientVol ?? '');
    setClinicDesc(profile.clinicDesc ?? '');
    setAmenities(profile.amenities ?? []);
    setAccommodation(profile.accommodationProvided ?? false);
  }, [profile]);

  // ── Completion checks (shared with dashboard via hostProfileCompletionPct) ─
  const progressPct = hostProfileCompletionPct({
    clinicName,
    contactFirstName: contactFirst,
    contactLastName: contactLast,
    cpsnsNumber: cpsns,
    speciality: specialties.join(', '),
    address1: addr1,
    address2: addr2,
    postalCode: postal,
    city,
    province,
    practiceType,
    numPhysicians,
    emr,
    patientVol,
    clinicDesc,
    amenities,
    accommodationProvided: accommodation,
  });
  const allDone = progressPct === 100;
  const completionImageSrc = !allDone
    ? '/profile-incomplete.png'
    : verified
      ? '/profile-verified.png'
      : '/profile-underverification.png';

  const completionTitle = !allDone
    ? 'Finish setting up your profile to start finding practitioners'
    : verified
      ? 'Your profile is complete and verified'
      : 'Your profile is complete — CPSNS under verification';
  const completionSubtitle = !allDone
    ? `${progressPct}% completed`
    : verified
      ? '100% completed · CPSNS verified'
      : '100% completed · Awaiting manual CPSNS verification';
  const stepComplete = [
    !!(
      clinicName &&
      contactFirst &&
      contactLast &&
      cpsns &&
      specialties.length
    ),
    !!(addr1 && postal && city && province),
    !!(practiceType && numPhysicians && emr && patientVol),
    amenities.length > 0,
  ];

  function getStatus(n: number): StepStatus {
    if (activeStep === n) return 'active';
    if (stepComplete[n - 1]) return 'complete';
    if (visited.has(n)) return 'incomplete';
    return 'upcoming';
  }

  function goToStep(n: number) {
    setVisited((v) => new Set([...v, n]));
    setActiveStep(n);
  }

  const steps = [
    { n: 1, label: 'Basic Information', sub: 'Your personal identity' },
    { n: 2, label: 'Clinic Information', sub: 'Location & branding' },
    { n: 3, label: 'Practice Details', sub: 'Patient and EMR info' },
    { n: 4, label: 'Services offered', sub: 'Procedures & specialties' },
  ];

  // ── Save handler ─────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveError('');
    const data: HostProfile = {
      clinicName,
      contactFirstName: contactFirst,
      contactLastName: contactLast,
      cpsnsNumber: cpsns,
      speciality: specialties.join(', '),
      licenseFile,
      address1: addr1,
      address2: addr2,
      postalCode: postal,
      city,
      province,
      amenities,
      accommodationProvided: accommodation,
      practiceType,
      numPhysicians,
      emr,
      patientVol,
      clinicDesc,
    };
    try {
      await saveProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError('Could not save. Please try again.');
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashLayout
        navItems={NAV}
        activeHref="/host/profile"
        topbarFirstName={profile?.contactFirstName}
        topbarLastName={profile?.contactLastName}
      >
        <div
          style={{
            padding: '40px 36px',
            fontFamily: 'Inter, sans-serif',
            color: '#8892a4',
            fontSize: 14,
          }}
        >
          Loading profile…
        </div>
      </DashLayout>
    );
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <DashLayout
      navItems={NAV}
      activeHref="/host/profile"
      topbarFirstName={profile?.contactFirstName}
      topbarLastName={profile?.contactLastName}
    >
      <div
        style={{
          padding: '28px 36px 60px',
          maxWidth: 1180,
          fontFamily: 'Inter, sans-serif',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            width: 850,
            height: 56,
            position: 'relative',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: -8,
              height: 43,
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'Inter, sans-serif',
              fontStyle: 'normal',
              fontWeight: 700,
              fontSize: 36,
              lineHeight: '120%',
              textTransform: 'capitalize',
              color: '#0B0F1F',
            }}
          >
            Welcome
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 37,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'Inter, sans-serif',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: 16,
              lineHeight: '150%',
              textTransform: 'capitalize',
              color: '#6B7280',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%',
            }}
          >
            Define and manage organizational, hierarchy, departments, and
            relationships with AI-powered insights
          </div>
        </div>

        {/* Completion card */}
        <div
          style={{
            width: '100%',
            height: 104,
            background: 'rgba(209, 213, 219, 0.3)',
            borderRadius: 10,
            marginBottom: 16,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              top: 26,
              height: 52,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{ width: 52, height: 52, position: 'relative', flexShrink: 0 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <Image
                    src={completionImageSrc}
                    alt=""
                    width={52}
                    height={52}
                    style={{ display: 'block', width: 52, height: 52, objectFit: 'cover' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontStyle: 'normal',
                    fontWeight: 500,
                    fontSize: 22,
                    lineHeight: '124%',
                    color: 'rgba(21, 20, 20, 0.7)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {completionTitle}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontStyle: 'normal',
                      fontWeight: 400,
                      fontSize: 18,
                      lineHeight: '100%',
                      color: '#606061',
                    }}
                  >
                    {completionSubtitle}
                  </div>
                </div>
              </div>
            </div>

            {/* Right side intentionally left empty (Figma shows spacing) */}
            <div style={{ width: 1, height: 1 }} />
          </div>
        </div>

        {/* CPSNS: manual verification — only show pending banner until verified */}
        {allDone && !verified && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 20 }}>🛡️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                CPSNS under verification
              </div>
              <div style={{ fontSize: 12, color: '#B45309' }}>
                An administrator will verify your CPSNS number. You can post jobs
                once verified.
              </div>
            </div>
          </div>
        )}
        {allDone && verified && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>
                CPSNS verified
              </div>
              <div style={{ fontSize: 12, color: '#047857' }}>
                Your registration has been manually verified. You can post jobs.
              </div>
            </div>
          </div>
        )}

        {/* Stepper */}
        <div
          style={{
            width: 1142,
            height: 70,
            opacity: 1,
            transform: 'rotate(0deg)',
            boxSizing: 'border-box',
            overflowX: 'hidden',
            overflowY: 'hidden',
            background: 'transparent',
            position: 'relative',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 1132,
              height: 48,
              left: 0,
              top: 0,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            {steps.map((s) => {
              const isActive = activeStep === s.n;
              const isCompleted = activeStep > s.n;
              const circleBg = isActive ? '#1522A6' : '#fff';
              const circleBorder = isActive
                ? 'none'
                : '1px solid rgba(21, 20, 20, 0.4)';
              const circleColor = isActive ? '#FFFFFF' : '#6B7280';
              return (
                <div
                  key={s.n}
                  onClick={() => goToStep(s.n)}
                  style={{
                    position: 'relative',
                    width: 274,
                    height: 48,
                    cursor: 'pointer',
                    flex: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      width: 36,
                      height: 36,
                      left: 0,
                      top: 6,
                      borderRadius: '50%',
                      background: circleBg,
                      border: circleBorder,
                      boxSizing: 'border-box',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: 36,
                      height: 36,
                      transform: 'translate(calc(-50% - 119px), -50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'Inter, sans-serif',
                      fontStyle: 'normal',
                      fontWeight: 500,
                      fontSize: 18,
                      lineHeight: '100%',
                      color: circleColor,
                    }}
                  >
                    {isCompleted ? '✓' : s.n}
                  </div>

                  <div
                    style={{
                      position: 'absolute',
                      left: 52,
                      top: 1,
                      width: 176,
                      height: 46,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        height: 20,
                        fontFamily: 'Inter, sans-serif',
                        fontStyle: 'normal',
                        fontWeight: 500,
                        fontSize: 20,
                        lineHeight: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        color: '#0B0F1F',
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        height: 22,
                        display: 'flex',
                        alignItems: 'center',
                        fontFamily: 'Inter, sans-serif',
                        fontStyle: 'normal',
                        fontWeight: 400,
                        fontSize: 16,
                        lineHeight: '140%',
                        color: '#6B7280',
                      }}
                    >
                      {s.sub}
                    </div>
                  </div>

                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#210840"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      position: 'absolute',
                      left: 256,
                      top: 15,
                      transform: 'rotate(-90deg)',
                    }}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              );
            })}

            {/* Bottom progress bar */}
            <div
              style={{
                position: 'absolute',
                left: (activeStep - 1) * 286,
                top: 64,
                width: 256,
                height: 6,
                background: 'linear-gradient(270deg, #3A65DB 0%, #1B31D2 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: (activeStep - 1) * 286 + 256,
                top: 69,
                right: 0,
                height: 1,
                background: '#D1D5DB',
              }}
            />
          </div>
        </div>

        {/* Form container (Figma Frame 2043683741) */}
        <div
          style={{
            width: 1180,
            minHeight: 1905,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: 0,
            gap: 24,
            boxSizing: 'border-box',
          }}
        >
        {/* ── Section 1: Basic Information ────────────────────────────────── */}
        <div
          style={sectionCard(activeStep === 1, { gap: 24, height: 700 })}
          onClick={() => goToStep(1)}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#0f1523',
              marginBottom: 14,
            }}
          >
            ⚙️ Basic Information
          </div>

          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#0f1523',
              marginBottom: 12,
            }}
          >
            Clinic Information
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label style={lbl}>Clinic name</label>
              <input
                style={inp}
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="Enter clinic name"
              />
            </div>
            <div>
              <label style={lbl}>Contact Person</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...inp, flex: 1 }}
                  value={contactFirst}
                  onChange={(e) => setContactFirst(e.target.value)}
                  placeholder="First name"
                />
                <input
                  style={{ ...inp, flex: 1 }}
                  value={contactLast}
                  onChange={(e) => setContactLast(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#0f1523',
              marginBottom: 10,
            }}
          >
            Host Doctors
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#F8F9FC',
              border: '1px solid #e2e5ee',
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 10,
              width: '48%',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#eef0fb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
              }}
            >
              ⚙️
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#0f1523' }}>
                {hostFirst || hostLast
                  ? `${hostFirst} ${hostLast}`.trim()
                  : 'Host Doctor 1'}
              </div>
              <div style={{ fontSize: 11, color: '#8892a4' }}>Just Now</div>
            </div>
          </div>
          <button
            style={{
              padding: '7px 14px',
              background: '#fff',
              border: '1.5px dashed #3B4FD8',
              borderRadius: 6,
              fontSize: 13,
              color: '#3B4FD8',
              cursor: 'pointer',
              marginBottom: 16,
            }}
          >
            + Add Host
          </button>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={lbl}>Name</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...inp, flex: 1 }}
                  value={hostFirst}
                  onChange={(e) => setHostFirst(e.target.value)}
                  placeholder="First"
                />
                <input
                  style={{ ...inp, flex: 1 }}
                  value={hostLast}
                  onChange={(e) => setHostLast(e.target.value)}
                  placeholder="Last"
                />
              </div>
            </div>
            <div>
              <label style={lbl}>CPSNS Number *</label>
              <input
                style={inp}
                value={cpsns}
                onChange={(e) => setCpsns(e.target.value)}
                placeholder="Enter CPSNS number"
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>CPSNS License</label>
            {licenseFile ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid #d0d4e4',
                  borderRadius: 6,
                  padding: '8px 12px',
                  background: '#F8F9FC',
                }}
              >
                <span style={{ fontSize: 13, color: '#0f1523' }}>
                  {licenseFile}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLicenseFile(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: 16,
                  }}
                >
                  🗑️
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) =>
                    setLicenseFile(e.target.files?.[0]?.name ?? null)
                  }
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                  style={{
                    ...inp,
                    cursor: 'pointer',
                    color: '#3B4FD8',
                    border: '1.5px dashed #3B4FD8',
                    textAlign: 'left',
                  }}
                >
                  Upload Document ⬆
                </button>
              </>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Speciality *</label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 6,
              }}
            >
              {specialties.map((s) => (
                <span
                  key={s}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    borderRadius: 20,
                    background: '#eef0fb',
                    border: '1px solid #3B4FD8',
                    color: '#3B4FD8',
                    fontSize: 12,
                  }}
                >
                  {s}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSpecialties((sp) => sp.filter((x) => x !== s));
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#3B4FD8',
                      padding: 0,
                      fontSize: 13,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              style={inp}
              value={specialtyInput}
              onChange={(e) => setSpecialtyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && specialtyInput.trim()) {
                  e.stopPropagation();
                  setSpecialties((sp) => [...sp, specialtyInput.trim()]);
                  setSpecialtyInput('');
                }
              }}
              placeholder="Type speciality and press Enter"
            />
          </div>
        </div>

        {/* ── Section 2: Clinic Location ──────────────────────────────────── */}
        <div
          style={sectionCard(activeStep === 2, { gap: 16, height: 392 })}
          onClick={() => goToStep(2)}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#0f1523',
              marginBottom: 14,
            }}
          >
            📍 Clinic Location
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
              <label style={lbl}>Address Line 1</label>
              <input
                style={inp}
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                placeholder="Address line 1"
              />
            </div>
            <div>
              <label style={lbl}>Address Line 2</label>
              <input
                style={inp}
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                placeholder="Address line 2"
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Postal Code</label>
            <input
              style={{ ...inp, width: '50%' }}
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="Postal code"
            />
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
          >
            <div>
              <label style={lbl}>City</label>
              <input
                style={inp}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
            </div>
            <div>
              <label style={lbl}>Province</label>
              <input
                style={inp}
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="Province"
              />
            </div>
          </div>
        </div>

        {/* ── Section 3: Practice Details ─────────────────────────────────── */}
        <div
          style={sectionCard(activeStep === 3, { gap: 24, height: 396 })}
          onClick={() => goToStep(3)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24 }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0B0F1F"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M8 13h8" />
            </svg>
            <div
              style={{
                fontFamily: 'Inter, sans-serif',
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: 24,
                lineHeight: '100%',
                display: 'flex',
                alignItems: 'center',
                color: '#0B0F1F',
              }}
            >
              Practice Details
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 24,
            }}
          >
            <div>
              <label style={{ ...lbl, fontSize: 20, fontWeight: 500, lineHeight: '140%', color: 'rgba(11, 15, 31, 0.8)', marginBottom: 8 }}>
                Practice Type
              </label>
              <input
                style={{ ...inp, height: 44, borderRadius: 4, border: '1px solid #D0D5DD' }}
                value={practiceType}
                onChange={(e) => setPracticeType(e.target.value)}
                placeholder="Enter"
              />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 20, fontWeight: 500, lineHeight: '140%', color: 'rgba(11, 15, 31, 0.8)', marginBottom: 8 }}>
                No. of Physicians
              </label>
              <input
                style={{ ...inp, height: 44, borderRadius: 4, border: '1px solid #D0D5DD' }}
                value={numPhysicians}
                onChange={(e) => setNumPhysicians(e.target.value)}
                placeholder="Physician"
              />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 20, fontWeight: 500, lineHeight: '140%', color: 'rgba(11, 15, 31, 0.8)', marginBottom: 8 }}>
                EMR System
              </label>
              <input
                style={{ ...inp, height: 44, borderRadius: 4, border: '1px solid #D0D5DD' }}
                value={emr}
                onChange={(e) => setEmr(e.target.value)}
                placeholder="Physician"
              />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 20, fontWeight: 500, lineHeight: '140%', color: 'rgba(11, 15, 31, 0.8)', marginBottom: 8 }}>
                Patient Volume
              </label>
              <input
                style={{ ...inp, height: 44, borderRadius: 4, border: '1px solid #D0D5DD' }}
                value={patientVol}
                onChange={(e) => setPatientVol(e.target.value)}
                placeholder="Physician"
              />
            </div>
          </div>
          <div>
            <label style={{ ...lbl, fontSize: 20, fontWeight: 500, lineHeight: '140%', color: 'rgba(11, 15, 31, 0.8)', marginBottom: 8 }}>
              Clinic description
            </label>
            <textarea
              style={
                {
                  ...inp,
                  height: 56,
                  resize: 'none',
                  borderRadius: 4,
                  border: '1px solid #D0D5DD',
                } as React.CSSProperties
              }
              value={clinicDesc}
              onChange={(e) => setClinicDesc(e.target.value)}
              placeholder="Add Description"
            />
          </div>
        </div>

        {/* ── Section 4: Services Offered ─────────────────────────────────── */}
        <div
          style={sectionCard(activeStep === 4, { gap: 24, height: 300, borderRadius: 4 })}
          onClick={() => goToStep(4)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24 }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0B0F1F"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l2.6-2.6a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0z" />
              <path d="M10.2 7.8 2 16v6h6l8.2-8.2" />
              <path d="M16 5 19 8" />
            </svg>
            <div
              style={{
                fontFamily: 'Inter, sans-serif',
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: 24,
                lineHeight: '100%',
                display: 'flex',
                alignItems: 'center',
                color: '#0B0F1F',
              }}
            >
              Services Offered
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <div
              style={{
                fontFamily: 'Inter, sans-serif',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: 20,
                lineHeight: '140%',
                color: 'rgba(11, 15, 31, 0.8)',
              }}
            >
              Amenities
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 713 }}>
              {AMENITY_OPTIONS.map((a) => (
                <span
                  key={a}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAmenities((am) =>
                      am.includes(a) ? am.filter((x) => x !== a) : [...am, a],
                    );
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px 16px',
                    height: 42,
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: '#fff',
                    border: `1px solid ${amenities.includes(a) ? 'rgba(21, 34, 166, 0.6)' : '#D0D5DD'}`,
                    color: amenities.includes(a) ? '#1522A6' : '#636364',
                    fontSize: 16,
                    fontWeight: 400,
                    fontFamily: 'Gilroy-Medium, Inter, sans-serif',
                  }}
                >
                  {a}
                  {amenities.includes(a) && (
                    <span style={{ marginLeft: 10, fontSize: 14, lineHeight: '14px' }}>×</span>
                  )}
                </span>
              ))}
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={accommodation}
                onChange={(e) => setAccommodation(e.target.checked)}
                style={{
                  width: 14,
                  height: 14,
                  border: '1px solid rgba(21, 20, 20, 0.4)',
                  borderRadius: 4,
                }}
              />
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: 20,
                  lineHeight: '140%',
                  color: 'rgba(11, 15, 31, 0.8)',
                }}
              >
                Accommodation provided for Locum physicians
              </span>
            </label>
          </div>
        </div>

        {/* Feedback */}
        {saved && (
          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 12,
              fontSize: 13,
              color: '#166534',
            }}
          >
            ✓ Profile saved successfully.
          </div>
        )}
        {saveError && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 12,
              fontSize: 13,
              color: '#dc2626',
            }}
          >
            {saveError}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 28px',
            background: saving ? '#a5b4fc' : '#3B4FD8',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Done'}
        </button>
        </div>
      </div>
    </DashLayout>
  );
}
