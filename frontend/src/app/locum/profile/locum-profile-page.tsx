'use client';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
  useMemo,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import LocumProfileStatusBanner from '@/components/LocumProfileStatusBanner';
import { locumApi, uploadFile } from '@/lib/api';
import { buildLocumSavePayload } from '@/lib/locumProfilePayload';
import {
  formatUploadedFileLabel,
  originalUploadFileName,
} from '@/lib/uploadDisplayName';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { LocumProfile } from '@/types';
import {
  type CpsnsVerificationStatus,
  hasCpsnsNumber,
  isCpsnsVerificationApproved,
  sanitizeCpsnsInput,
} from '@/lib/cpsnsVerify';
import { NameWithVerifiedShield } from '@/components/NameWithVerifiedShield';
import { locumProfileCompletionPct } from '@/lib/locumProfileCompletion';
import {
  PROFILE_FORM_CAPITALIZE_CLASS,
  PROFILE_FORM_CAPITALIZE_CSS,
  profileSectionHeadingStyle,
  profileTextCapitalize,
} from '@/lib/profileFormTypography';
import { useAnchoredDropdownMenu } from '@/hooks/useAnchoredDropdownMenu';
import { AnchoredDropdownPortal } from '@/components/ui/AnchoredDropdownMenu';
import { dispatchProfileUpdated } from '@/lib/profileUpdatedEvent';
import { beforeClientNavigation } from '@/lib/topLoader';
import { getEmail } from '@/lib/auth';
import { sortStringsLocale } from '@/lib/sortLocale';
import {
  filterCanadianCities,
  CANADIAN_PROVINCE_NAMES,
  formatCanadianCityDisplay,
  type CanadianCityRow,
} from '@/lib/canadianCities';

const NAV = [
  {
    label: 'Browse Opportunities',
    href: '/locum/browse',
    icon: <NavIcon name="browse" />,
  },
  {
    label: 'My Applications',
    href: '/locum/dashboard',
    icon: <NavIcon name="postings" />,
  },
  {
    label: 'Profile',
    href: '/locum/profile',
    icon: <NavIcon name="profile" />,
  },
  {
    label: 'Messages',
    href: '/locum/messages',
    icon: <NavIcon name="messages" />,
  },
  {
    label: 'Resources',
    href: '/locum/resources',
    icon: <NavIcon name="resources" />,
  },
  {
    label: 'Settings',
    href: '/locum/settings',
    icon: <NavIcon name="settings" />,
  },
];

const SPECIALITY_OPTIONS = sortStringsLocale([
  'Family Physician',
  'Internal medicine',
  'ENT',
  'Emergency Medicine',
  'Anesthesiology',
  'Paediatrics',
]);

type StepStatus = 'complete' | 'active' | 'incomplete' | 'upcoming';
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
  display: 'block',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 400,
  fontSize: 16,
  lineHeight: '140%',
  letterSpacing: 0,
  color: '#374151',
  marginBottom: 5,
  ...profileTextCapitalize,
};

const documentFormatHint: React.CSSProperties = {
  fontSize: 12,
  color: '#8892a4',
  margin: '6px 0 0',
  lineHeight: 1.4,
  ...profileTextCapitalize,
};

/* ── city highlight helper (from host profile) ────────────────────────────── */
const CITY_MATCH_MARK: React.CSSProperties = {
  background: 'rgba(15,42,122,0.12)',
  color: '#0F2A7A',
  borderRadius: 3,
  padding: '0 2px',
  fontWeight: 700,
};

function highlightCityName(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const idx = lower.indexOf(lq);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={CITY_MATCH_MARK}>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ── step status helpers ──────────────────────────────────────────────────── */
function stepBorderColor(s: StepStatus) {
  if (s === 'complete') return '#16a34a';
  if (s === 'active') return '#3B4FD8';
  if (s === 'incomplete') return '#f97316';
  return '#e2e5ee';
}

export default function LocumProfilePage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const router = useRouter();

  /* navigation */
  const [activeStep, setActiveStep] = useState(1);
  const [visited, setVisited] = useState<Set<number>>(new Set([1]));

  /* save state */
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');

  /* ── step 1 – basic information ─────────────────────────────────────── */
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [cpsns, setCpsns] = useState('');
  const [cpsnsVerificationStatus, setCpsnsVerificationStatus] = useState<
    CpsnsVerificationStatus | undefined
  >();
  const [accountStatus, setAccountStatus] =
    useState<LocumProfile['accountStatus']>();
  const [yearsOfExperience, setYearsOfExperience] = useState<number | ''>('');
  const [summary, setSummary] = useState('');
  const [specialityTags, setSpecialityTags] = useState<string[]>([]);

  /* ── step 2 – contact details ───────────────────────────────────────── */
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(getEmail() ?? '');

  /* ── step 3 – location ──────────────────────────────────────────────── */
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');

  /* city autocomplete */
  const [cityResults, setCityResults] = useState<CanadianCityRow[]>([]);
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [cityActiveIdx, setCityActiveIdx] = useState(-1);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const cityAnchorRef = useRef<HTMLDivElement>(null);
  const cityMenuRef = useRef<HTMLDivElement>(null);
  const cityMenuBox = useAnchoredDropdownMenu(
    cityDropOpen,
    setCityDropOpen,
    cityAnchorRef,
    cityMenuRef,
    220,
  );
  const cityBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── step 4 – relevant documents ───────────────────────────────────── */
  const [licenseFile, setLicenseFile] = useState('');
  const [licenseLabel, setLicenseLabel] = useState('');
  const [resumeFile, setResumeFile] = useState('');
  const [resumeLabel, setResumeLabel] = useState('');
  const [extraFile, setExtraFile] = useState('');
  const [extraLabel, setExtraLabel] = useState('');
  const [licenseViewUrl, setLicenseViewUrl] = useState<string | null>(null);
  const [resumeViewUrl, setResumeViewUrl] = useState<string | null>(null);
  const [extraViewUrl, setExtraViewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const licenseRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);

  /* section scroll refs (1-indexed) */
  const stepSectionRefs = useRef<Record<number, HTMLDivElement | null>>({});

  /* ── city search helpers (ported from host profile) ─────────────────── */
  const searchCities = useCallback((q: string) => {
    if (!q || q.trim().length < 2) {
      setCityResults([]);
      setCityDropOpen(false);
      return;
    }
    const found = filterCanadianCities(q, 8);
    setCityResults(found);
    setCityActiveIdx(-1);
    setCityDropOpen(true);
  }, []);

  function handleCitySelect(row: CanadianCityRow) {
    setCity(formatCanadianCityDisplay(row.name));
    setProvince(CANADIAN_PROVINCE_NAMES[row.province] ?? row.province);
    setCityResults([]);
    setCityDropOpen(false);
  }

  function handleCityKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!cityDropOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCityActiveIdx((i) => Math.min(i + 1, cityResults.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCityActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && cityActiveIdx >= 0 && cityResults[cityActiveIdx]) {
      e.preventDefault();
      handleCitySelect(cityResults[cityActiveIdx]);
    }
    if (e.key === 'Escape') setCityDropOpen(false);
  }

  useEffect(
    () => () => {
      if (cityBlurTimer.current != null) clearTimeout(cityBlurTimer.current);
    },
    [],
  );

  /* ── load existing profile ───────────────────────────────────────────── */
  useEffect(() => {
    locumApi
      .getProfile()
      .then((data) => {
        const typed = data as unknown as {
          exists: boolean;
          profile: LocumProfile | null;
        };
        if (!typed.exists || !typed.profile) return;
        const p = typed.profile;
        setFirstName(p.firstName ?? '');
        setLastName(p.lastName ?? '');
        setCpsns(hasCpsnsNumber(p.cpsnsNumber) ? (p.cpsnsNumber ?? '') : '');
        setCpsnsVerificationStatus(p.cpsnsVerificationStatus);
        setAccountStatus(p.accountStatus);
        setYearsOfExperience(
          typeof (p as { yearsOfExperience?: unknown }).yearsOfExperience ===
            'number'
            ? ((p as { yearsOfExperience: number }).yearsOfExperience ?? 0)
            : '',
        );
        setSummary(p.professionalSummary ?? '');
        setSpecialityTags(
          p.specialization
            ? p.specialization
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [],
        );
        setPhone(p.phone ?? '');
        setAddr1(p.address1 ?? '');
        setAddr2(p.address2 ?? '');
        setCity(formatCanadianCityDisplay(p.city ?? ''));
        setProvince(p.province ?? '');
        setPostal(p.postalCode ?? '');

        const lf = p.licenseFile ?? p.licenseFileName ?? '';
        const rf = p.resumeFile ?? p.resumeFileName ?? '';
        const xf = p.extraFile ?? p.extraFileName ?? '';
        setLicenseFile(lf);
        setLicenseLabel(p.licenseOriginalName ?? '');
        setResumeFile(rf);
        setResumeLabel(p.resumeOriginalName ?? '');
        setExtraFile(xf);
        setExtraLabel(p.extraOriginalName ?? '');
        setLicenseViewUrl(/^https?:\/\//.test(lf) ? lf : null);
        setResumeViewUrl(/^https?:\/\//.test(rf) ? rf : null);
        setExtraViewUrl(/^https?:\/\//.test(xf) ? xf : null);
      })
      .catch((e: unknown) => {
        setLoadError(
          e instanceof Error ? e.message : 'Could not load profile data.',
        );
      });
  }, []);

  /* ── step completion flags ────────────────────────────────────────────── */
  const step1Done = !!(
    firstName &&
    lastName &&
    hasCpsnsNumber(cpsns) &&
    summary &&
    specialityTags.length
  );
  const step2Done = !!phone.trim();
  const step3Done = !!(
    addr1.trim() &&
    city.trim() &&
    province.trim() &&
    postal.trim()
  );
  const step4Done = !!(licenseFile && resumeFile);
  const stepDone = [step1Done, step2Done, step3Done, step4Done];

  /* ── profile draft for progress calc ─────────────────────────────────── */
  const profileDraft = useMemo(
    (): LocumProfile => ({
      firstName,
      lastName,
      cpsnsNumber: cpsns,
      yearsOfExperience:
        yearsOfExperience === '' ? null : Math.max(0, yearsOfExperience),
      professionalSummary: summary,
      specialization: specialityTags.join(', '),
      phone,
      address1: addr1,
      address2: addr2,
      postalCode: postal,
      city,
      province,
      licenseFile,
      resumeFile,
      extraFile,
    }),
    [
      firstName,
      lastName,
      cpsns,
      yearsOfExperience,
      summary,
      specialityTags,
      phone,
      addr1,
      addr2,
      postal,
      city,
      province,
      licenseFile,
      resumeFile,
      extraFile,
    ],
  );

  const profileForBanner = useMemo(
    (): LocumProfile => ({
      ...profileDraft,
      cpsnsVerificationStatus,
      accountStatus,
    }),
    [profileDraft, cpsnsVerificationStatus, accountStatus],
  );

  const progressPct = locumProfileCompletionPct(profileDraft);
  const cpsnsVerified = isCpsnsVerificationApproved(cpsnsVerificationStatus);
  const welcomeDoctorLabel =
    firstName || lastName
      ? `Dr ${firstName.trim()} ${lastName.trim()}`.trim()
      : '';
  /* ── step status / navigation ─────────────────────────────────────────── */
  function getStatus(n: number): StepStatus {
    const idx = n - 1;
    if (activeStep === n) return 'active';
    if (stepDone[idx]) return 'complete';
    if (visited.has(n)) return 'incomplete';
    return 'upcoming';
  }

  function goToStep(n: number) {
    setVisited((v) => new Set([...v, n]));
    setActiveStep(n);
  }

  function handleStepNavClick(n: number) {
    goToStep(n);
    requestAnimationFrame(() => {
      stepSectionRefs.current[n]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  /* ── save ─────────────────────────────────────────────────────────────── */
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
            yearsOfExperience:
              yearsOfExperience === '' ? null : Math.max(0, yearsOfExperience),
            professionalSummary: summary,
            specialization: specialityTags.join(', '),
            phone,
            address1: addr1,
            address2: addr2,
            postalCode: postal,
            city,
            province,
          },
          {
            licenseFile,
            resumeFile,
            extraFile,
            licenseOriginalName: licenseLabel,
            resumeOriginalName: resumeLabel,
            extraOriginalName: extraLabel,
          },
        ),
      );
      dispatchProfileUpdated();
      setSaved(true);
      window.setTimeout(() => {
        beforeClientNavigation('/locum/dashboard');
        router.push('/locum/dashboard');
      }, 900);
    } catch {
      setLoadError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  /* ── step definitions ─────────────────────────────────────────────────── */
  const steps = [
    { n: 1, label: 'Basic Information', sub: 'Your personal identity' },
    { n: 2, label: 'Contact details', sub: 'Phone & email' },
    { n: 3, label: 'Location', sub: 'Your clinic address' },
    { n: 4, label: 'Relevant Documents', sub: 'Licence & documents' },
  ];

  const sectionBorder = (n: number) =>
    `1px solid ${stepBorderColor(getStatus(n))}`;

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <DashLayout
      navItems={NAV}
      activeHref="/locum/profile"
      topbarFirstName={firstName}
      topbarLastName={lastName}
    >
      <style>{PROFILE_FORM_CAPITALIZE_CSS}</style>
      <div
        className={`${PROFILE_FORM_CAPITALIZE_CLASS} locum-profile-page`}
      >
        {/* ── page title ─────────────────────────────────────────────────── */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 3,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <NameWithVerifiedShield verified={cpsnsVerified}>
            <span>
              Welcome{welcomeDoctorLabel ? ` ${welcomeDoctorLabel}` : ''}
            </span>
          </NameWithVerifiedShield>
        </h1>

        <LocumProfileStatusBanner
          profile={profileForBanner}
          completionPct={progressPct}
        />

        {/* ── step progress bar ──────────────────────────────────────────── */}
        <div
          style={{
            width: '100%',
            maxWidth: '100%',
            marginBottom: 20,
            fontFamily: 'Inter, var(--font-family-body, DM Sans), sans-serif',
          }}
        >
          <div
            className="locum-step-nav"
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
                    gap: 8,
                    flex: '0 0 auto',
                    minWidth: 0,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleStepNavClick(s.n)}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
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
                      fontSize: 13,
                      fontWeight: 600,
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
                      className="profile-step-label"
                      style={profileSectionHeadingStyle}
                    >
                      {s.label}
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

          {/* progress label + bar */}
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
                      : 'linear-gradient(270deg, #3A65DB 0%, #0F2A7A 100%)',
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
          <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
            {loadError}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
          STEP 1 – BASIC INFORMATION
      ══════════════════════════════════════════════════════════════════ */}
        <div
          ref={(node) => {
            stepSectionRefs.current[1] = node;
          }}
          onClick={() => goToStep(1)}
          className="locum-section-card"
          style={{
            background: '#fff',
            border: sectionBorder(1),
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            cursor: 'pointer',
          }}
        >
          <div className="locum-section-header">
            <div className="locum-section-header-icon">
              <Image
                src="/basic-information.svg"
                alt=""
                width={20}
                height={20}
                className="locum-profile-icon"
                style={{ objectFit: 'contain' }}
              />
            </div>
            <span>Basic Information</span>
          </div>

          {/* Name row */}
          <div
            className="locum-form-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div>
              <label style={lbl}>First Name</label>
              <input
                style={inp}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="First name"
              />
            </div>
            <div>
              <label style={lbl}>Last Name</label>
              <input
                style={inp}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Last name"
              />
            </div>
          </div>

          {/* CPSNS + years */}
          <div
            className="locum-form-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div>
              <label style={{ ...lbl, textTransform: 'none' }}>
                CPSNS Number
              </label>
              <input
                style={{ ...inp, textTransform: 'none' }}
                inputMode="numeric"
                autoComplete="off"
                value={cpsns}
                onChange={(e) => setCpsns(sanitizeCpsnsInput(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                placeholder="CPSNS Number"
              />
            </div>
            <div>
              <label style={{ ...lbl, textTransform: 'none' }}>
                Years of Experience
              </label>
              <input
                style={{ ...inp, textTransform: 'none' }}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={yearsOfExperience}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setYearsOfExperience('');
                    return;
                  }
                  const n = Math.trunc(Number(v));
                  if (!Number.isFinite(n)) return;
                  setYearsOfExperience(Math.max(0, n));
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Years of Experience"
              />
            </div>
          </div>

          {/* Summary */}
          <div
            className="locum-form-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div>
              <label style={lbl}>Professional Profile (Career Summary)</label>
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
                placeholder="Professional Profile (Career Summary)"
              />
            </div>
            <div aria-hidden />
          </div>

          {/* Speciality */}
          <div
            className="locum-form-row locum-speciality-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 10,
            }}
          >
            <div style={{ minWidth: 0, width: '100%' }}>
              <label style={lbl}>Speciality</label>
              <div
                className="locum-speciality-select-wrap"
                style={{
                  position: 'relative',
                  marginBottom: 8,
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <select
                  className="locum-speciality-select"
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
                    if (v && !specialityTags.includes(v))
                      setSpecialityTags((t) => [...t, v]);
                    e.target.selectedIndex = 0;
                  }}
                >
                  <option value="">Pick Speciality</option>
                  {SPECIALITY_OPTIONS.filter(
                    (o) => !specialityTags.includes(o),
                  ).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
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

          {/* Speciality tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {specialityTags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: '#eef0fb',
                  border: '1px solid #3B4FD8',
                  color: '#3B4FD8',
                  fontSize: 12,
                }}
              >
                {tag}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSpecialityTags((t) => t.filter((x) => x !== tag));
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8892a4',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 13,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
          STEP 2 – CONTACT DETAILS
      ══════════════════════════════════════════════════════════════════ */}
        <div
          ref={(node) => {
            stepSectionRefs.current[2] = node;
          }}
          onClick={() => goToStep(2)}
          className="locum-section-card"
          style={{
            background: '#fff',
            border: sectionBorder(2),
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            cursor: 'pointer',
          }}
        >
          <div className="locum-section-header">
            <div className="locum-section-header-icon">
              <Image
                src="/contact-details.svg"
                alt=""
                width={20}
                height={20}
                className="locum-profile-icon"
                style={{ objectFit: 'contain' }}
              />
            </div>
            <span>Contact details</span>
          </div>

          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
          >
            <div>
              <label style={lbl}>Phone number</label>
              <input
                style={inp}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Phone number"
                type="tel"
                autoComplete="tel"
              />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input
                style={{ ...inp }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Email"
              />
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
          STEP 3 – LOCATION  (NEW)
      ══════════════════════════════════════════════════════════════════ */}
        <div
          ref={(node) => {
            stepSectionRefs.current[3] = node;
          }}
          onClick={() => goToStep(3)}
          className="locum-section-card"
          style={{
            background: '#fff',
            border: sectionBorder(3),
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            cursor: 'pointer',
          }}
        >
          <div className="locum-section-header">
            <div className="locum-section-header-icon">
              <Image
                src="/location.svg"
                alt=""
                width={20}
                height={20}
                className="locum-profile-icon"
                style={{ objectFit: 'contain' }}
              />
            </div>
            <span>Location</span>
          </div>

          {/* Address Line 1 + 2 */}
          <div
            className="locum-form-row"
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
                onClick={(e) => e.stopPropagation()}
                placeholder="Address Line 1"
              />
            </div>
            <div>
              <label style={lbl}>Address Line 2</label>
              <input
                style={inp}
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Address Line 2"
              />
            </div>
          </div>

          {/* City (with autocomplete) + Province */}
          <div
            className="locum-form-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 12,
            }}
          >
            {/* City */}
            <div ref={cityAnchorRef} style={{ position: 'relative' }}>
              <label htmlFor="locum-profile-city" style={lbl}>
                City
              </label>
              <input
                id="locum-profile-city"
                ref={cityInputRef}
                autoComplete="off"
                style={inp}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setProvince('');
                  searchCities(e.target.value);
                }}
                onKeyDown={handleCityKeyDown}
                onFocus={() => {
                  if (cityBlurTimer.current != null)
                    clearTimeout(cityBlurTimer.current);
                  if (city.trim().length >= 2) searchCities(city);
                  else if (cityResults.length) setCityDropOpen(true);
                }}
                onBlur={(e) => {
                  setCity(formatCanadianCityDisplay(e.target.value));
                  cityBlurTimer.current = setTimeout(
                    () => setCityDropOpen(false),
                    160,
                  );
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="City"
              />

              {/* Dropdown */}
              <AnchoredDropdownPortal
                open={cityDropOpen}
                menuBox={cityMenuBox}
                menuRef={cityMenuRef}
              >
                {cityResults.length === 0 ? (
                  <div
                    style={{
                      padding: 14,
                      fontSize: 13,
                      color: 'rgba(11,15,31,0.45)',
                      textAlign: 'center',
                    }}
                  >
                    No city found
                  </div>
                ) : (
                  cityResults.map((row, i) => (
                    <div
                      key={`${row.name}-${row.province}`}
                      role="option"
                      aria-selected={i === cityActiveIdx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCitySelect(row);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        background:
                          i === cityActiveIdx
                            ? 'rgba(15,42,122,0.05)'
                            : 'transparent',
                        borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#0B0F1F',
                        }}
                      >
                        {highlightCityName(row.name, city)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'rgba(59,198,198,0.12)',
                          color: '#0F6E56',
                          padding: '2px 9px',
                          borderRadius: 20,
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {CANADIAN_PROVINCE_NAMES[row.province] ?? row.province}
                      </span>
                    </div>
                  ))
                )}
              </AnchoredDropdownPortal>
            </div>

            {/* Province (auto-fills from city selection, also manually editable) */}
            <div>
              <label style={lbl}>Province</label>
              <input
                style={inp}
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Province"
              />
            </div>
          </div>

          {/* Postal Code */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
          >
            <div>
              <label style={lbl}>Postal Code</label>
              <input
                style={inp}
                value={postal}
                onChange={(e) => setPostal(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Postal Code"
              />
            </div>
            <div aria-hidden />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
          STEP 4 – RELEVANT DOCUMENTS
      ══════════════════════════════════════════════════════════════════ */}
        <div
          ref={(node) => {
            stepSectionRefs.current[4] = node;
          }}
          onClick={() => goToStep(4)}
          className="locum-section-card"
          style={{
            background: '#fff',
            border: sectionBorder(4),
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            cursor: 'pointer',
          }}
        >
          <div className="locum-section-header">
            <div className="locum-section-header-icon">
              <Image
                src="/relevant-docs.svg"
                alt=""
                width={20}
                height={20}
                className="locum-profile-icon"
                style={{ objectFit: 'contain' }}
              />
            </div>
            <span>Relevant Documents</span>
          </div>

          {/* License + Resume */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginBottom: 14,
            }}
          >
            {/* CPSNS License */}
            <div>
              <label style={lbl}>CPSNS License</label>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (licenseFile && licenseViewUrl) {
                    window.open(
                      licenseViewUrl,
                      '_blank',
                      'noopener,noreferrer',
                    );
                    return;
                  }
                  licenseRef.current?.click();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: licenseFile
                    ? '1px solid #3B4FD8'
                    : '1px solid #e2e5ee',
                  borderRadius: 6,
                  padding: '9px 12px',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Image
                    src="/document-link.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="locum-profile-icon"
                    style={{ flexShrink: 0, objectFit: 'contain' }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: licenseFile ? '#3B4FD8' : '#8892a4',
                    }}
                  >
                    {uploading === 'license'
                      ? 'Uploading…'
                      : formatUploadedFileLabel(
                          licenseFile,
                          licenseLabel,
                          'CPSNS License',
                        )}
                  </span>
                  {licenseFile && (
                    <button
                      type="button"
                      aria-label="Delete CPSNS License"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLicenseFile('');
                        setLicenseLabel('');
                        setLicenseViewUrl(null);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        background: 'transparent',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M4 7h16"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M10 11v6M14 11v6"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M6 7l1 14h10l1-14M9 7V4h6v3"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <p style={documentFormatHint}>
                Accepted formats: PDF, DOC, DOCX, PNG.
              </p>
              <input
                ref={licenseRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading('license');
                  try {
                    const result = await uploadFile(file, 'locum/license');
                    setLicenseFile(result.path);
                    setLicenseLabel(originalUploadFileName(result, file));
                    setLicenseViewUrl(result.signedUrl);
                  } catch {
                    alert('Upload failed. Try again.');
                  } finally {
                    setUploading(null);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {/* Resume */}
            <div>
              <label style={lbl}>Resume</label>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (resumeFile && resumeViewUrl) {
                    window.open(resumeViewUrl, '_blank', 'noopener,noreferrer');
                    return;
                  }
                  resumeRef.current?.click();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: resumeFile
                    ? '1px solid #3B4FD8'
                    : '1px solid #e2e5ee',
                  borderRadius: 6,
                  padding: '9px 12px',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Image
                    src="/document-link.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="locum-profile-icon"
                    style={{ flexShrink: 0, objectFit: 'contain' }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: resumeFile ? '#3B4FD8' : '#8892a4',
                    }}
                  >
                    {uploading === 'resume'
                      ? 'Uploading…'
                      : formatUploadedFileLabel(
                          resumeFile,
                          resumeLabel,
                          'Resume',
                        )}
                  </span>
                  {resumeFile && (
                    <button
                      type="button"
                      aria-label="Delete Resume"
                      onClick={(e) => {
                        e.stopPropagation();
                        setResumeFile('');
                        setResumeLabel('');
                        setResumeViewUrl(null);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        background: 'transparent',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M4 7h16"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M10 11v6M14 11v6"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M6 7l1 14h10l1-14M9 7V4h6v3"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <p style={documentFormatHint}>
                Accepted formats: PDF, DOC, DOCX, PNG.
              </p>
              <input
                ref={resumeRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading('resume');
                  try {
                    const result = await uploadFile(file, 'locum/resume');
                    setResumeFile(result.path);
                    setResumeLabel(originalUploadFileName(result, file));
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
          </div>

          {/* Additional documents */}
          <label style={lbl}>Additional documents</label>
          <p style={{ fontSize: 12, color: '#8892a4', margin: '0 0 8px' }}>
            - Cover letter, reference letters, etc
          </p>
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (extraFile && extraViewUrl) {
                window.open(extraViewUrl, '_blank', 'noopener,noreferrer');
                return;
              }
              extraRef.current?.click();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: extraFile ? '1px solid #3B4FD8' : '1px solid #e2e5ee',
              borderRadius: 6,
              padding: '9px 12px',
              cursor: 'pointer',
              width: '48%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                flex: 1,
                minWidth: 0,
              }}
            >
              <Image
                src="/document-link.svg"
                alt=""
                width={24}
                height={24}
                className="locum-profile-icon"
                style={{ flexShrink: 0, objectFit: 'contain' }}
              />
              <span
                style={{
                  fontSize: 13,
                  color: extraFile ? '#3B4FD8' : '#8892a4',
                }}
              >
                {uploading === 'extra'
                  ? 'Uploading…'
                  : formatUploadedFileLabel(
                      extraFile,
                      extraLabel,
                      'Additional Documents',
                    )}
              </span>
              {extraFile && (
                <button
                  type="button"
                  aria-label="Delete additional documents"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExtraFile('');
                    setExtraLabel('');
                    setExtraViewUrl(null);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    background: 'transparent',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M4 7h16"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10 11v6M14 11v6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6 7l1 14h10l1-14M9 7V4h6v3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p style={documentFormatHint}>
            Accepted formats: PDF, DOC, DOCX, PNG.
          </p>
          <input
            ref={extraRef}
            type="file"
            accept=".pdf,.doc,.docx,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading('extra');
              try {
                const result = await uploadFile(file, 'locum/extra');
                setExtraFile(result.path);
                setExtraLabel(originalUploadFileName(result, file));
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

        {/* ── save feedback + button ─────────────────────────────────────── */}
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

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 28px',
            background: saving
              ? '#8892a4'
              : 'linear-gradient(270deg, #3A65DB 0%, #0F2A7A 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: saving ? 'none' : '0 2px 10px rgba(15, 42, 122, 0.22)',
          }}
        >
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>
    </DashLayout>
  );
}
