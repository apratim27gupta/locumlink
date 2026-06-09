'use client';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from 'react';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import {
  ProfileStatusGlyph,
  type ProfileStatusGlyphVariant,
} from '@/components/ProfileStatusGlyph';
import { authApi, uploadFile } from '@/lib/api';
import {
  formatUploadedFileLabel,
  originalUploadFileName,
} from '@/lib/uploadDisplayName';
import { useHostProfile } from '@/hooks/useHostProfile';
import type { HostProfile } from '@/types';
import { hostProfileCompletionPct } from '@/lib/hostProfileCompletion';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import {
  hasCpsnsNumber,
  isCpsnsVerificationApproved,
  sanitizeCpsnsInput,
} from '@/lib/cpsnsVerify';
import {
  filterCanadianCities,
  CANADIAN_PROVINCE_NAMES,
  formatCanadianCityDisplay,
  type CanadianCityRow,
} from '@/lib/canadianCities';
import { sortByLabel, sortStringsLocale } from '@/lib/sortLocale';
import { NameWithVerifiedShield } from '@/components/NameWithVerifiedShield';
import { getHostProfileStatusCard } from '@/lib/hostAccountNotice';
import VerificationStatusPill from '@/components/VerificationStatusPill';
import { getHostVerificationStatusBadge } from '@/lib/profileVerificationBadge';
import {
  PROFILE_FORM_CAPITALIZE_CLASS,
  PROFILE_FORM_CAPITALIZE_CSS,
  profileTextCapitalize,
} from '@/lib/profileFormTypography';
import { useAnchoredDropdownMenu } from '@/hooks/useAnchoredDropdownMenu';
import { AnchoredDropdownPortal } from '@/components/ui/AnchoredDropdownMenu';

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
  {
    label: 'Settings',
    href: '/host/settings',
    icon: <NavIcon name="settings" />,
  },
];

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
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

const pageTitle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontWeight: 700,
  fontSize: 22,
  lineHeight: '120%',
  color: '#0f1523',
  margin: 0,
  ...profileTextCapitalize,
};

const cardHeaderTitle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1,
  color: '#0f1523',
  ...profileTextCapitalize,
};

const subsectionHeading: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  fontWeight: 600,
  lineHeight: '140%',
  color: '#0f1523',
  margin: '0 0 12px',
  ...profileTextCapitalize,
};

const fieldInput: React.CSSProperties = {
  ...inp,
  fontFamily: 'Inter, sans-serif',
  minHeight: 37,
};

const selectField: React.CSSProperties = {
  ...fieldInput,
  padding: '8px 36px 8px 10px',
  appearance: 'none',
};

const textareaField: React.CSSProperties = {
  ...fieldInput,
  minHeight: 68,
  resize: 'vertical',
  lineHeight: 1.45,
};

const stepNavLabel: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontWeight: 500,
  fontSize: 17,
  lineHeight: 1.25,
  color: '#0B0F1F',
  ...profileTextCapitalize,
};

const stepSectionIconColor = '#1E3FAF';

const formRowTwoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
  width: '100%',
  alignItems: 'start',
};

const formFieldCol: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
};

const AMENITY_OPTIONS = sortStringsLocale([
  'On-site Parking',
  'Digital X-Ray',
  'Laboratory services',
  'Pharmacy nearby',
  'Cafeteria',
  'Private Office Space',
  'IT Support',
  'Family Practice Nurses',
  'Social Worker',
  'Dietitian',
 'Pharmacist',
'EMR Training Available',
'Blood Collection Centre Nearby',
'Hospital Nearby',
'Minor Procedures',
'Flexible Scheduling',
'Accommodation Provided',
'On-Site Parking'

]);

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

const SPECIALITY_OPTIONS = sortStringsLocale([
  'Emergency Medicine',
  'Anesthesiology',
  'Family Physician',
  'Internal medicine',
  'Paediatrics',
  'ENT',
  'Psychiatry',
  'Radiology',
]);

const CUSTOM_PRACTICE_TYPE = '__custom__';
const KNOWN_PRACTICE_TYPE_VALUES = sortByLabel([
  {
    value: 'Collaborative Family Practice',
    label: 'Collaborative Family Practice',
  },
  {
    value: 'Nurse Practitioner (NP) Clinic',
    label: 'Nurse Practitioner (NP) Clinic',
  },
  { value: 'Primary Care Clinic', label: 'Primary Care Clinic' },
  {
    value: 'Traditional Fee for Service Practice',
    label: 'Traditional Fee for Service Practice',
  },
  { value: 'Virtual Care Clinic', label: 'Virtual Care Clinic' },
]);
const PRACTICE_TYPE_OPTIONS = [
  ...KNOWN_PRACTICE_TYPE_VALUES,
  { value: CUSTOM_PRACTICE_TYPE, label: 'Custom practice type' },
];

function practiceTypePickerLabel(choice: string): string {
  if (!choice) return 'Select practice type';
  return (
    PRACTICE_TYPE_OPTIONS.find((o) => o.value === choice)?.label ?? choice
  );
}

function splitPracticeTypeFromSaved(saved: string): {
  choice: string;
  custom: string;
} {
  if (!saved.trim()) return { choice: '', custom: '' };
  if (KNOWN_PRACTICE_TYPE_VALUES.some((o) => o.value === saved))
    return { choice: saved, custom: '' };
  return { choice: CUSTOM_PRACTICE_TYPE, custom: saved };
}

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
    width: '100%',
    ...(opts?.height != null ? { height: opts.height } : { height: 'auto' }),
    border: '1px solid #D9D9D9',
    borderRadius: opts?.borderRadius ?? 10,
    marginBottom: 0,
  };
}

export default function HostProfilePage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const { profile, loading, saveProfile, saving } = useHostProfile();
  const verified = isCpsnsVerificationApproved(
    profile?.cpsnsVerificationStatus,
  );
  const welcomeDoctorLabel =
    profile?.contactFirstName || profile?.contactLastName
      ? `Dr ${(profile?.contactFirstName ?? '').trim()} ${(profile?.contactLastName ?? '').trim()}`.trim()
      : '';

  const [clinicName, setClinicName] = useState('');
  const [contactFirst, setContactFirst] = useState('');
  const [contactLast, setContactLast] = useState('');
  const [hostFirst, setHostFirst] = useState('');
  const [hostLast, setHostLast] = useState('');
  const [cpsns, setCpsns] = useState('');
  const [licenseFile, setLicenseFile] = useState<string | null>(null);
  const [licenseLabel, setLicenseLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialtyInput, setSpecialtyInput] = useState('');
  const [specialtyDropdownOpen, setSpecialtyDropdownOpen] = useState(false);
  const specialtyAnchorRef = useRef<HTMLDivElement>(null);
  const specialtyMenuRef = useRef<HTMLDivElement>(null);
  const specialtyMenuBox = useAnchoredDropdownMenu(
    specialtyDropdownOpen,
    setSpecialtyDropdownOpen,
    specialtyAnchorRef,
    specialtyMenuRef,
    320,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [postal, setPostal] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');

  const [practiceTypeChoice, setPracticeTypeChoice] = useState('');
  const [practiceTypeCustom, setPracticeTypeCustom] = useState('');
  const [practiceTypeDropdownOpen, setPracticeTypeDropdownOpen] =
    useState(false);
  const practiceTypeAnchorRef = useRef<HTMLDivElement>(null);
  const practiceTypeMenuRef = useRef<HTMLDivElement>(null);
  const practiceTypeMenuBox = useAnchoredDropdownMenu(
    practiceTypeDropdownOpen,
    setPracticeTypeDropdownOpen,
    practiceTypeAnchorRef,
    practiceTypeMenuRef,
    280,
  );
  const [numPhysicians, setNumPhysicians] = useState('');
  const [emr, setEmr] = useState('');
  const [patientVol, setPatientVol] = useState('');
  const [clinicDesc, setClinicDesc] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [accommodation, setAccommodation] = useState(false);
  const [customAmenity, setCustomAmenity] = useState('');
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [activeStep, setActiveStep] = useState(1);
  const [visited, setVisited] = useState<Set<number>>(new Set([1]));
  const stepSectionRefs = useRef<(HTMLDivElement | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const [hostCityResults, setHostCityResults] = useState<CanadianCityRow[]>([]);
  const [hostCityDropOpen, setHostCityDropOpen] = useState(false);
  const [hostCityActiveIdx, setHostCityActiveIdx] = useState(-1);
  const hostCityInputRef = useRef<HTMLInputElement>(null);
  const hostCityAnchorRef = useRef<HTMLDivElement>(null);
  const hostCityMenuRef = useRef<HTMLDivElement>(null);
  const hostCityMenuBox = useAnchoredDropdownMenu(
    hostCityDropOpen,
    setHostCityDropOpen,
    hostCityAnchorRef,
    hostCityMenuRef,
    220,
  );
  const hostCityBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchHostCities = useCallback((q: string) => {
    if (!q || q.trim().length < 2) {
      setHostCityResults([]);
      setHostCityDropOpen(false);
      return;
    }
    const found = filterCanadianCities(q, 8);
    setHostCityResults(found);
    setHostCityActiveIdx(-1);
    setHostCityDropOpen(true);
  }, []);

  function handleHostCitySelect(city: CanadianCityRow) {
    setCity(formatCanadianCityDisplay(city.name));
    setProvince(CANADIAN_PROVINCE_NAMES[city.province] ?? city.province);
    setHostCityResults([]);
    setHostCityDropOpen(false);
  }

  function handleHostCityKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!hostCityDropOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHostCityActiveIdx((i) => Math.min(i + 1, hostCityResults.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHostCityActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (
      e.key === 'Enter' &&
      hostCityActiveIdx >= 0 &&
      hostCityResults[hostCityActiveIdx]
    ) {
      e.preventDefault();
      handleHostCitySelect(hostCityResults[hostCityActiveIdx]);
    }
    if (e.key === 'Escape') setHostCityDropOpen(false);
  }

  useEffect(() => {
    if (!profile) return;
    setClinicName(profile.clinicName ?? '');
    setContactFirst(profile.contactFirstName ?? '');
    setContactLast(profile.contactLastName ?? '');
    setHostFirst(profile.contactFirstName ?? '');
    setHostLast(profile.contactLastName ?? '');
    setCpsns(profile.cpsnsNumber ?? '');
    setLicenseFile(profile.licenseFile ?? null);
    setLicenseLabel(profile.licenseOriginalName ?? '');
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
    setCity(formatCanadianCityDisplay(profile.city ?? ''));
    setProvince(profile.province ?? '');
    {
      const { choice, custom } = splitPracticeTypeFromSaved(
        profile.practiceType ?? '',
      );
      setPracticeTypeChoice(choice);
      setPracticeTypeCustom(custom);
    }
    setNumPhysicians(profile.numPhysicians ?? '');
    setEmr(profile.emr ?? '');
    setPatientVol(profile.patientVol ?? '');
    setClinicDesc((profile.clinicDesc ?? '').slice(0, 1000));
    setAmenities(profile.amenities ?? []);
    setAccommodation(profile.accommodationProvided ?? false);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    const refreshAvatar = async () => {
      try {
        const me = await authApi.getMe();
        if (!cancelled) setAvatarPhotoUrl(me.avatarUrl ?? null);
      } catch {
        /* keep prior avatar */
      }
    };
    void refreshAvatar();
    window.addEventListener('focus', refreshAvatar);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshAvatar);
    };
  }, []);

  useEffect(() => {
    if (!avatarPreviewOpen) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setAvatarPreviewOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [avatarPreviewOpen]);

  useEffect(
    () => () => {
      if (hostCityBlurTimer.current != null)
        clearTimeout(hostCityBlurTimer.current);
    },
    [],
  );

  const resolvedPracticeType =
    practiceTypeChoice === CUSTOM_PRACTICE_TYPE
      ? practiceTypeCustom.trim()
      : practiceTypeChoice.trim();

  const derivedContactFirst = (hostFirst || contactFirst).trim();
  const derivedContactLast = (hostLast || contactLast).trim();

  const progressPct = hostProfileCompletionPct({
    clinicName,
    contactFirstName: derivedContactFirst,
    contactLastName: derivedContactLast,
    cpsnsNumber: cpsns,
    speciality: specialties.join(', '),
    address1: addr1,
    address2: addr2,
    postalCode: postal,
    city,
    province,
    practiceType: resolvedPracticeType,
    numPhysicians,
    emr,
    patientVol,
    clinicDesc,
    amenities,
    accommodationProvided: accommodation,
  });

  const allDone = progressPct === 100;
  const profileStatusCard = getHostProfileStatusCard(profile, progressPct);
  const completionGlyphVariant: ProfileStatusGlyphVariant =
    profileStatusCard.glyphVariant;
  const completionTitle = profileStatusCard.title;
  const completionSubtitle = profileStatusCard.subtitle;

  const stepComplete = [
    !!(
      derivedContactFirst &&
      derivedContactLast &&
      hasCpsnsNumber(cpsns) &&
      specialties.length
    ),
    !!(clinicName && addr1 && postal && city && province),
    !!(resolvedPracticeType && numPhysicians && emr && patientVol),
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
    const idx = n - 1;
    const scrollToSection = () => {
      const el =
        stepSectionRefs.current[idx] ??
        (typeof document !== 'undefined'
          ? document.getElementById(`host-profile-step-${n}`)
          : null);
      el?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    };
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(scrollToSection);
      });
    }
  }

  const steps = [
    { n: 1, label: 'Basic Information', sub: 'Your personal identity' },
    { n: 2, label: 'Clinic Information', sub: 'Location & branding' },
    { n: 3, label: 'Practice Details', sub: 'Patient and EMR info' },
    { n: 4, label: 'Services offered', sub: 'Procedures & specialties' },
  ];

  async function handleSave() {
    setSaveError('');
    const data: HostProfile = {
      clinicName,
      contactFirstName: derivedContactFirst,
      contactLastName: derivedContactLast,
      cpsnsNumber: cpsns,
      speciality: specialties.join(', '),
      licenseFile,
      licenseOriginalName: licenseFile ? licenseLabel.trim() || null : null,
      address1: addr1,
      address2: addr2,
      postalCode: postal,
      city,
      province,
      amenities,
      accommodationProvided: accommodation,
      practiceType: resolvedPracticeType,
      numPhysicians,
      emr,
      patientVol,
      clinicDesc: clinicDesc.slice(0, 1000),
    };
    try {
      await saveProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError('Could not save. Please try again.');
    }
  }

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

  return (
    <DashLayout
      navItems={NAV}
      activeHref="/host/profile"
      topbarFirstName={profile?.contactFirstName}
      topbarLastName={profile?.contactLastName}
    >
      <>
        <style>{`
        ${PROFILE_FORM_CAPITALIZE_CSS}
        .host-profile-practice-select-mobile {
          display: none;
        }
        @media (max-width: 768px) {
          .host-profile-inner {
            padding: 0 !important;
          }
          .host-step-nav-outer {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: thin !important;
            scrollbar-color: #9CA3AF #F3F4F6 !important;
          }
          .host-step-nav-outer::-webkit-scrollbar {
            display: block !important;
            height: 6px !important;
          }
          .host-step-nav-outer::-webkit-scrollbar-track {
            background: #F3F4F6 !important;
            border-radius: 3px !important;
          }
          .host-step-nav-outer::-webkit-scrollbar-thumb {
            background: #9CA3AF !important;
            border-radius: 3px !important;
          }
          .host-step-nav-inner {
            display: flex !important;
            flex-wrap: nowrap !important;
            width: max-content !important;
            gap: 8px !important;
          }
          .host-step-nav-step {
            flex: 0 0 auto !important;
            flex-wrap: nowrap !important;
            width: 168px !important;
            min-width: 168px !important;
            max-width: 168px !important;
          }
          .host-profile-inner > div[style] {
            width: 100% !important;
          }
          .host-profile-form-row-2 {
            grid-template-columns: 1fr !important;
          }
          .host-profile-practice-select {
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .host-profile-practice-select-desktop {
            display: none !important;
          }
          .host-profile-practice-select-mobile {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .host-profile-practice-mobile-trigger {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            text-align: left !important;
          }
          .host-profile-practice-mobile-trigger-label {
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            flex: 1 1 auto !important;
            min-width: 0 !important;
          }
          .host-profile-practice-mobile-option {
            white-space: normal !important;
            word-break: break-word !important;
            text-align: left !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>
        <div
          className={`host-profile-inner dash-page-shell ${PROFILE_FORM_CAPITALIZE_CLASS}`}
          style={{
            padding: 0,
            maxWidth: 1180,
            width: '100%',
            fontFamily: 'Inter, sans-serif',
            boxSizing: 'border-box',
            position: 'relative',
          }}
        >
          {/* ── Page heading ── */}
          <div style={{ marginBottom: 16 }}>
            <h1
              style={{
                ...pageTitle,
                textTransform: 'capitalize',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <NameWithVerifiedShield verified={verified}>
                <span>
                  Welcome
                  {welcomeDoctorLabel ? ` ${welcomeDoctorLabel}` : ''}
                </span>
              </NameWithVerifiedShield>
            </h1>
          </div>

          {/* ── Completion banner ── */}
          <div
            style={{
              width: '100%',
              background: 'rgba(209, 213, 219, 0.3)',
              borderRadius: 10,
              marginBottom: 16,
              padding: '20px 16px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 24,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  minWidth: 0,
                }}
              >
                <div style={{ width: 52, height: 52, flexShrink: 0 }}>
                  <ProfileStatusGlyph
                    variant={completionGlyphVariant}
                    size={52}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      fontSize: 15,
                      lineHeight: '124%',
                      color: '#0f1523',
                      whiteSpace: 'normal',
                      overflow: 'visible',
                    }}
                  >
                    {completionTitle}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    {(() => {
                      const variant = completionGlyphVariant;
                      const isUnderVerification = variant === 'underReview';
                      const isVerified = variant === 'verified';
                      const subtitleStyle = {
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 400,
                        fontSize: 13,
                        lineHeight: '140%',
                        color: '#6B7280',
                      } as const;
                      if (!isUnderVerification && !isVerified) {
                        return (
                          <div style={subtitleStyle}>{completionSubtitle}</div>
                        );
                      }
                      const badge = getHostVerificationStatusBadge(profile);
                      return (
                        <>
                          <div style={subtitleStyle}>
                            {progressPct}% completed
                          </div>
                          {badge ? <VerificationStatusPill {...badge} /> : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Step nav ── */}
          <div
            className="host-step-nav-outer"
            style={{
              width: '100%',
              height: 70,
              opacity: 1,
              transform: 'rotate(0deg)',
              boxSizing: 'border-box',
              overflowX: 'auto',
              overflowY: 'hidden',
              background: 'transparent',
              position: 'relative',
              marginBottom: 24,
            }}
          >
            <div
              className="host-step-nav-inner"
              style={{
                position: 'relative',
                width: 'max-content',
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
                const circleBg = isActive ? '#1522A6' : '#fff';
                const circleBorder = isActive
                  ? 'none'
                  : '1px solid rgba(21, 20, 20, 0.4)';
                const circleColor = isActive ? '#FFFFFF' : '#6B7280';
                const labelStyle: React.CSSProperties = {
                  ...stepNavLabel,
                  color: isActive ? '#0B0F1F' : '#6B7280',
                  fontWeight: isActive ? 600 : 500,
                };
                return (
                  <div
                    key={s.n}
                    className="host-step-nav-step"
                    role="button"
                    tabIndex={0}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`${s.label}, step ${s.n} of ${steps.length}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goToStep(s.n);
                      }
                    }}
                    onClick={() => goToStep(s.n)}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      width: 274,
                      minHeight: 48,
                      cursor: 'pointer',
                      flex: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: circleBg,
                        border: circleBorder,
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontFamily: 'Inter, sans-serif',
                        fontStyle: 'normal',
                        fontWeight: 500,
                        fontSize: 18,
                        lineHeight: 1,
                        color: circleColor,
                      }}
                    >
                      {s.n}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: 4,
                        alignItems: 'flex-start',
                      }}
                    >
                      <div className="profile-step-label" style={labelStyle}>
                        {s.label}
                      </div>
                    </div>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{
                        flexShrink: 0,
                        transform: 'rotate(-90deg)',
                        color: '#210840',
                        opacity: 0.55,
                      }}
                      aria-hidden="true"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                );
              })}

              {/* Active underline */}
              <div
                style={{
                  position: 'absolute',
                  left: (activeStep - 1) * 286,
                  top: 64,
                  width: 256,
                  height: 6,
                  background:
                    'linear-gradient(270deg, #3A65DB 0%, #0F2A7A 100%)',
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

          {/* ── Form sections ── */}
          <div
            style={{
              width: '100%',
              minHeight: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: 0,
              gap: 24,
              boxSizing: 'border-box',
            }}
          >
            {/* ── Step 1: Basic Information ── */}
            <div
              id="host-profile-step-1"
              ref={(el) => {
                stepSectionRefs.current[0] = el;
              }}
              style={{
                ...sectionCard(activeStep === 1, { gap: 24 }),
                minHeight: 680,
                scrollMarginTop: 20,
              }}
              onClick={() => goToStep(1)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  role={avatarPhotoUrl ? 'button' : undefined}
                  tabIndex={avatarPhotoUrl ? 0 : undefined}
                  aria-label={avatarPhotoUrl ? 'View profile photo' : undefined}
                  onClick={(e) => {
                    if (!avatarPhotoUrl) return;
                    e.stopPropagation();
                    setAvatarPreviewOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (!avatarPhotoUrl) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setAvatarPreviewOpen(true);
                    }
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    flexShrink: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: avatarPhotoUrl ? 'pointer' : 'default',
                  }}
                >
                  {avatarPhotoUrl ? (
                    <img
                      src={avatarPhotoUrl}
                      alt=""
                      width={24}
                      height={24}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        pointerEvents: 'none',
                      }}
                    />
                  ) : (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ color: stepSectionIconColor }}
                      aria-hidden
                    >
                      <circle
                        cx="12"
                        cy="8"
                        r="4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 20c0-3.866 3.582-7 8-7s8 3.134 8 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span style={cardHeaderTitle}>Basic Information</span>
              </div>

              <div
                style={{
                  width: '100%',
                  maxWidth: 560,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                }}
              >
                {/* Name */}
                <div
                  style={{
                    width: '100%',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <label style={lbl}>Name</label>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <input
                      style={{ ...fieldInput, flex: '1 1 120px', minWidth: 0 }}
                      value={hostFirst}
                      onChange={(e) => setHostFirst(e.target.value)}
                      placeholder="First name"
                    />
                    <input
                      style={{ ...fieldInput, flex: '1 1 120px', minWidth: 0 }}
                      value={hostLast}
                      onChange={(e) => setHostLast(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>

                {/* CPSNS Number */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <label style={lbl}>CPSNS Number</label>
                  <input
                    style={fieldInput}
                    inputMode="numeric"
                    autoComplete="off"
                    value={cpsns}
                    onChange={(e) =>
                      setCpsns(sanitizeCpsnsInput(e.target.value))
                    }
                    placeholder="CPSNS Number"
                  />
                </div>

                {/* CPSNS License */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <label style={lbl}>CPSNS License</label>
                  {licenseFile ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        height: 'auto',
                        minHeight: 40,
                        border: '1px solid #22C55E',
                        borderRadius: 4,
                        background: '#fff',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 13,
                          fontWeight: 400,
                          color: '#0f1523',
                        }}
                      >
                        {uploading
                          ? 'Uploading…'
                          : formatUploadedFileLabel(
                              licenseFile,
                              licenseLabel,
                              'CPSNS License',
                            )}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLicenseFile(null);
                          setLicenseLabel('');
                        }}
                        title="Remove file"
                        style={{
                          width: 32,
                          height: 32,
                          background: '#F8F6F7',
                          borderRadius: '50%',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: '#475569',
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M2 4h12"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6.5 7.5v4M9.5 7.5v4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploading(true);
                          try {
                            const result = await uploadFile(
                              file,
                              'host/license',
                            );
                            setLicenseFile(result.path);
                            setLicenseLabel(
                              originalUploadFileName(result, file),
                            );
                          } catch {
                            alert('Upload failed. Try again.');
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileRef.current?.click();
                        }}
                        disabled={uploading}
                        style={{
                          width: '100%',
                          minHeight: 37,
                          padding: '8px 10px',
                          border: '1px solid #D0D5DD',
                          borderRadius: 6,
                          background: '#fff',
                          cursor: uploading ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: 10,
                          userSelect: 'none',
                          opacity: uploading ? 0.7 : 1,
                          boxSizing: 'border-box',
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          style={{ flexShrink: 0, opacity: 0.72 }}
                          aria-hidden
                        >
                          <path
                            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                            stroke="#3B4FD8"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M14 2v6h6"
                            stroke="#3B4FD8"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9 14h6"
                            stroke="#3B4FD8"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 13,
                            color: '#9CA3AF',
                          }}
                        >
                          {uploading ? 'Uploading…' : 'Upload CPSNS License'}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                {/* Speciality */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <label style={lbl}>Speciality</label>
                  <div
                    ref={specialtyAnchorRef}
                    style={{ position: 'relative', width: '100%', minWidth: 0 }}
                  >
                    <button
                      id="specialty-dropdown-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpecialtyDropdownOpen((v) => !v);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        minHeight: 37,
                        border: '1px solid #D0D5DD',
                        borderRadius: 6,
                        background: '#fff',
                        cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 13,
                          fontWeight: 400,
                          color: specialties.length
                            ? 'rgba(11, 15, 31, 0.8)'
                            : 'rgba(11, 15, 31, 0.4)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {specialties.length
                          ? specialties.join(', ')
                          : 'Pick Speciality'}
                      </span>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                        style={{ flexShrink: 0, color: stepSectionIconColor }}
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    <AnchoredDropdownPortal
                      open={specialtyDropdownOpen}
                      menuBox={specialtyMenuBox}
                      menuRef={specialtyMenuRef}
                      style={{
                        border: '1px solid #D0D5DD',
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#0f1523',
                            marginBottom: 8,
                          }}
                        >
                          Custom title
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            marginBottom: 10,
                            maxHeight: 180,
                            overflowY: 'auto',
                            paddingRight: 2,
                          }}
                        >
                          {SPECIALITY_OPTIONS.map((opt) => {
                            const selected = specialties.includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSpecialties((sp) =>
                                    sp.includes(opt) ? sp : [...sp, opt],
                                  );
                                }}
                                style={{
                                  all: 'unset',
                                  cursor: 'pointer',
                                  padding: '10px 10px',
                                  borderRadius: 6,
                                  border: `1px solid ${
                                    selected
                                      ? 'rgba(21, 34, 166, 0.35)'
                                      : '#E5E7EB'
                                  }`,
                                  background: selected
                                    ? 'rgba(115, 177, 251, 0.12)'
                                    : '#fff',
                                  color: '#0B0F1F',
                                  fontSize: 13,
                                  fontWeight: 500,
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          style={fieldInput}
                          value={specialtyInput}
                          onChange={(e) => setSpecialtyInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && specialtyInput.trim()) {
                              e.stopPropagation();
                              setSpecialties((sp) => [
                                ...sp,
                                specialtyInput.trim(),
                              ]);
                              setSpecialtyInput('');
                            }
                          }}
                          placeholder="Type speciality and press Enter"
                        />
                      </div>
                    </AnchoredDropdownPortal>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      marginTop: 4,
                    }}
                  >
                    {specialties.map((s) => (
                      <span
                        key={s}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '0 12px',
                          height: 34,
                          background: 'rgba(115, 177, 251, 0.1)',
                          borderRadius: 40,
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 13,
                          fontWeight: 400,
                          color: '#1522A6',
                          letterSpacing: '0.02em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSpecialties((sp) => sp.filter((x) => x !== s));
                          }}
                          style={{
                            width: 16,
                            height: 16,
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1522A6',
                            fontSize: 14,
                            borderRadius: '50%',
                          }}
                          aria-label={`Remove ${s}`}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden
                          >
                            <path
                              d="M18 6 6 18M6 6l12 12"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Step 2: Clinic Information ── */}
            <div
              id="host-profile-step-2"
              ref={(el) => {
                stepSectionRefs.current[1] = el;
              }}
              style={{
                ...sectionCard(activeStep === 2, { gap: 16 }),
                scrollMarginTop: 20,
              }}
              onClick={() => goToStep(2)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0, color: stepSectionIconColor }}
                  aria-hidden
                >
                  <path
                    d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 21V12h6v9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={cardHeaderTitle}>Clinic Information</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                  width: '100%',
                }}
              >
                {/* Clinic name */}
                <div style={formFieldCol}>
                  <label style={lbl}>Clinic name</label>
                  <input
                    style={fieldInput}
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Enter clinic name"
                  />
                </div>

                {/* Address row */}
                <div className="host-profile-form-row-2" style={formRowTwoCol}>
                  <div style={formFieldCol}>
                    <label style={lbl}>Address Line 1</label>
                    <input
                      style={fieldInput}
                      value={addr1}
                      onChange={(e) => setAddr1(e.target.value)}
                      placeholder="Address Line 1"
                    />
                  </div>
                  <div style={formFieldCol}>
                    <label style={lbl}>Address Line 2</label>
                    <input
                      style={fieldInput}
                      value={addr2}
                      onChange={(e) => setAddr2(e.target.value)}
                      placeholder="Address Line 2"
                    />
                  </div>
                </div>

                {/* City / Province */}
                <div className="host-profile-form-row-2" style={formRowTwoCol}>
                  <div
                    ref={hostCityAnchorRef}
                    style={{ ...formFieldCol, position: 'relative' }}
                  >
                    <label htmlFor="host-profile-city" style={lbl}>
                      City
                    </label>
                    <input
                      id="host-profile-city"
                      ref={hostCityInputRef}
                      autoComplete="off"
                      style={fieldInput}
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setProvince('');
                        searchHostCities(e.target.value);
                      }}
                      onKeyDown={handleHostCityKeyDown}
                      onFocus={() => {
                        if (hostCityBlurTimer.current != null)
                          clearTimeout(hostCityBlurTimer.current);
                        if (city.trim().length >= 2) {
                          searchHostCities(city);
                        } else if (hostCityResults.length) {
                          setHostCityDropOpen(true);
                        }
                      }}
                      onBlur={(e) => {
                        setCity(formatCanadianCityDisplay(e.target.value));
                        hostCityBlurTimer.current = setTimeout(
                          () => setHostCityDropOpen(false),
                          160,
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="City"
                    />
                    <AnchoredDropdownPortal
                      open={hostCityDropOpen}
                      menuBox={hostCityMenuBox}
                      menuRef={hostCityMenuRef}
                    >
                      {hostCityResults.length === 0 ? (
                        <div
                          style={{
                            padding: '14px',
                            fontSize: 13,
                            color: 'rgba(11,15,31,0.45)',
                            textAlign: 'center',
                          }}
                        >
                          No city found
                        </div>
                      ) : (
                        hostCityResults.map((row, i) => (
                          <div
                            key={`${row.name}-${row.province}`}
                            role="option"
                            aria-selected={i === hostCityActiveIdx}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleHostCitySelect(row);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              cursor: 'pointer',
                              background:
                                i === hostCityActiveIdx
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
                              {CANADIAN_PROVINCE_NAMES[row.province] ??
                                row.province}
                            </span>
                          </div>
                        ))
                      )}
                    </AnchoredDropdownPortal>
                  </div>

                  <div style={formFieldCol}>
                    <label style={lbl}>Province</label>
                    <input
                      style={fieldInput}
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      placeholder="Province"
                    />
                  </div>
                </div>

                {/* Postal code */}
                <div className="host-profile-form-row-2" style={formRowTwoCol}>
                  <div style={formFieldCol}>
                    <label style={lbl}>Postal Code</label>
                    <input
                      style={fieldInput}
                      value={postal}
                      onChange={(e) => setPostal(e.target.value)}
                      placeholder="Postal Code"
                    />
                  </div>
                  <div aria-hidden />
                </div>
              </div>
            </div>

            {/* ── Step 3: Practice Details ── */}
            <div
              id="host-profile-step-3"
              ref={(el) => {
                stepSectionRefs.current[2] = el;
              }}
              style={{
                ...sectionCard(activeStep === 3, { gap: 24 }),
                scrollMarginTop: 20,
              }}
              onClick={() => goToStep(3)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0, color: stepSectionIconColor }}
                  aria-hidden
                >
                  <path
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 2v6h6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 14h6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={cardHeaderTitle}>Practice Details</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                  width: '100%',
                }}
              >
                {/* Practice type / No. of physicians */}
                <div className="host-profile-form-row-2" style={formRowTwoCol}>
                  <div style={formFieldCol}>
                    <label style={lbl}>Practice Type</label>
                    {/* ── Inline custom practice type: replaces select, no extra box ── */}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
                      {practiceTypeChoice === CUSTOM_PRACTICE_TYPE ? (
                        <>
                          <input
                            type="text"
                            autoFocus
                            value={practiceTypeCustom}
                            onChange={(e) =>
                              setPracticeTypeCustom(e.target.value)
                            }
                            placeholder="Enter custom practice type"
                            autoComplete="off"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...selectField,
                              paddingRight: 36,
                              ...(practiceTypeCustom.trim() === ''
                                ? { border: '1px solid #f97316' }
                                : {}),
                            }}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPracticeTypeChoice('');
                              setPracticeTypeCustom('');
                            }}
                            title="Back to list"
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#6B7280',
                              display: 'flex',
                              alignItems: 'center',
                              padding: 0,
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M18 6 6 18M6 6l12 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <div
                            className="host-profile-practice-select-desktop"
                            style={{ position: 'relative' }}
                          >
                            <select
                              className="host-profile-practice-select"
                              style={selectField}
                              value={practiceTypeChoice}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPracticeTypeChoice(v);
                                if (v !== CUSTOM_PRACTICE_TYPE)
                                  setPracticeTypeCustom('');
                              }}
                            >
                              <option value="" disabled>
                                Select practice type
                              </option>
                              {PRACTICE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 18 18"
                              fill="none"
                              style={{
                                position: 'absolute',
                                right: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                pointerEvents: 'none',
                                color: '#6B7280',
                              }}
                              aria-hidden="true"
                            >
                              <path
                                d="M4.5 6.75L9 11.25l4.5-4.5"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>

                          <div
                            ref={practiceTypeAnchorRef}
                            className="host-profile-practice-select-mobile"
                            style={{
                              position: 'relative',
                              width: '100%',
                              minWidth: 0,
                            }}
                          >
                            <button
                              type="button"
                              className="host-profile-practice-mobile-trigger"
                              aria-haspopup="listbox"
                              aria-expanded={practiceTypeDropdownOpen}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPracticeTypeDropdownOpen((v) => !v);
                              }}
                              style={{
                                ...selectField,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                cursor: 'pointer',
                                fontFamily: 'Inter, sans-serif',
                                color: practiceTypeChoice
                                  ? '#0f1523'
                                  : 'rgba(11, 15, 31, 0.4)',
                              }}
                            >
                              <span className="host-profile-practice-mobile-trigger-label">
                                {practiceTypePickerLabel(practiceTypeChoice)}
                              </span>
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 18 18"
                                fill="none"
                                style={{
                                  flexShrink: 0,
                                  color: '#6B7280',
                                }}
                                aria-hidden="true"
                              >
                                <path
                                  d="M4.5 6.75L9 11.25l4.5-4.5"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                            <AnchoredDropdownPortal
                              open={practiceTypeDropdownOpen}
                              menuBox={practiceTypeMenuBox}
                              menuRef={practiceTypeMenuRef}
                              style={{
                                border: '1px solid #D0D5DD',
                                borderRadius: 8,
                                padding: 8,
                              }}
                            >
                              <div
                                role="listbox"
                                aria-label="Practice type"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 4,
                                }}
                              >
                                {PRACTICE_TYPE_OPTIONS.map((opt) => {
                                  const selected =
                                    practiceTypeChoice === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      role="option"
                                      aria-selected={selected}
                                      className="host-profile-practice-mobile-option"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPracticeTypeChoice(opt.value);
                                        if (opt.value !== CUSTOM_PRACTICE_TYPE)
                                          setPracticeTypeCustom('');
                                        setPracticeTypeDropdownOpen(false);
                                      }}
                                      style={{
                                        all: 'unset',
                                        cursor: 'pointer',
                                        padding: '10px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${
                                          selected
                                            ? 'rgba(21, 34, 166, 0.35)'
                                            : '#E5E7EB'
                                        }`,
                                        background: selected
                                          ? 'rgba(115, 177, 251, 0.12)'
                                          : '#fff',
                                        color: '#0B0F1F',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        fontFamily: 'Inter, sans-serif',
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </AnchoredDropdownPortal>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={formFieldCol}>
                    <label style={lbl}>No. of Physicians</label>
                    <input
                      style={fieldInput}
                      value={numPhysicians}
                      onChange={(e) => setNumPhysicians(e.target.value)}
                      placeholder="No. of Physicians"
                    />
                  </div>
                </div>

                {/* EMR / Patient volume */}
                <div className="host-profile-form-row-2" style={formRowTwoCol}>
                  <div style={formFieldCol}>
                    <label style={lbl}>EMR System</label>
                    <input
                      style={fieldInput}
                      value={emr}
                      onChange={(e) => setEmr(e.target.value)}
                      placeholder="EMR system"
                    />
                  </div>
                  <div style={formFieldCol}>
                    <label style={lbl}>Patient Volume Per Day</label>
                    <input
                      style={fieldInput}
                      value={patientVol}
                      onChange={(e) => setPatientVol(e.target.value)}
                      placeholder="No. of patients per day"
                    />
                  </div>
                </div>

                {/* Clinic description */}
                <div style={formFieldCol}>
                    <label style={lbl}>
                      Clinic description{' '}
                      <span
                        style={{
                          fontWeight: 400,
                          fontSize: 13,
                          color: '#6B7280',
                        }}
                      >
                        (maximum 1000 characters)
                      </span>
                    </label>
                    <textarea
                      style={textareaField}
                      value={clinicDesc}
                      maxLength={1000}
                      onChange={(e) =>
                        setClinicDesc(e.target.value.slice(0, 1000))
                      }
                      placeholder="Clinic Description"
                    />
                </div>
              </div>
            </div>

            {/* ── Step 4: Services Offered ── */}
            <div
              id="host-profile-step-4"
              ref={(el) => {
                stepSectionRefs.current[3] = el;
              }}
              style={{
                ...sectionCard(activeStep === 4, { gap: 24, borderRadius: 4 }),
                scrollMarginTop: 20,
              }}
              onClick={() => goToStep(4)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 24,
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  style={{ flexShrink: 0, color: stepSectionIconColor }}
                >
                  <path
                    d="M4.5 16.5c-1.1 0-2-.9-2-2v-2.2c0-.9.5-1.8 1.3-2.1l1.8-.8a6 6 0 0 1 7.8 0l1.8.8c.8.4 1.3 1.2 1.3 2.1v2.2c0 1.1-.9 2-2 2h-11Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 8.5V6a4 4 0 0 1 8 0v2.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div style={cardHeaderTitle}>Services Offered</div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  width: '100%',
                }}
              >
                <div style={subsectionHeading}>Amenities</div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    maxWidth: 713,
                  }}
                >
                  {(() => {
                    const all = [
                      ...AMENITY_OPTIONS,
                      ...amenities.filter((a) => !AMENITY_OPTIONS.includes(a)),
                    ];
                    const seen = new Set<string>();
                    const unique = all.filter((a) => {
                      if (seen.has(a)) return false;
                      seen.add(a);
                      return true;
                    });
                    return sortStringsLocale(unique);
                  })().map((a) => (
                    <span
                      key={a}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAmenities((am) =>
                          am.includes(a)
                            ? am.filter((x) => x !== a)
                            : [...am, a],
                        );
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 14px',
                        height: 38,
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: '#fff',
                        border: `1px solid ${
                          amenities.includes(a)
                            ? 'rgba(21, 34, 166, 0.6)'
                            : '#D0D5DD'
                        }`,
                        color: amenities.includes(a) ? '#1522A6' : '#636364',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 13,
                        fontWeight: 400,
                      }}
                    >
                      {a}
                      {amenities.includes(a) && (
                        <span
                          style={{
                            marginLeft: 8,
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: 'inherit',
                          }}
                          aria-hidden
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <path
                              d="M18 6 6 18M6 6l12 12"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </span>
                      )}
                    </span>
                  ))}
                </div>

                <input
                  value={customAmenity}
                  onChange={(e) => setCustomAmenity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const v = customAmenity.trim();
                    if (!v) return;
                    e.stopPropagation();
                    setAmenities((am) => (am.includes(v) ? am : [...am, v]));
                    setCustomAmenity('');
                  }}
                  placeholder="Add custom amenity and press Enter"
                  style={{ ...fieldInput, maxWidth: 713 }}
                />

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
                      accentColor: '#1522A6',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: 16,
                      lineHeight: '140%',
                      color: '#374151',
                    }}
                  >
                    Accommodation provided for Locum
                  </span>
                </label>
              </div>
            </div>

            {/* ── Save feedback ── */}
            {saved && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 12,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  color: '#166534',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  style={{ flexShrink: 0 }}
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Profile saved successfully.
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
                  fontFamily: 'Inter, sans-serif',
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
                background: saving
                  ? '#9CA3AF'
                  : 'linear-gradient(270deg, #3A65DB 0%, #0F2A7A 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        </div>
        {avatarPreviewOpen && avatarPhotoUrl ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Profile photo preview"
            onClick={() => setAvatarPreviewOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              background: 'rgba(0, 0, 0, 0.92)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              aria-label="Close photo preview"
              onClick={() => setAvatarPreviewOpen(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: 24,
                lineHeight: 1,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ×
            </button>
            <img
              src={avatarPhotoUrl}
              alt="Profile photo"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 'min(92vw, 520px)',
                maxHeight: 'min(85vh, 720px)',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
              }}
            />
          </div>
        ) : null}
      </>
    </DashLayout>
  );
}

// Mobile CSS injected at module level
if (typeof document !== 'undefined') {
  const styleId = 'host-profile-mobile-fix';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      @media (max-width: 768px) {
        .host-profile-inner {
          padding: 0 !important;
        }
        .host-step-nav-outer {
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin !important;
          scrollbar-color: #9CA3AF #F3F4F6 !important;
        }
        .host-step-nav-outer::-webkit-scrollbar {
          display: block !important;
          height: 6px !important;
        }
        .host-step-nav-inner {
          display: flex !important;
          flex-wrap: nowrap !important;
          width: max-content !important;
          gap: 8px !important;
        }
        .host-step-nav-step {
          flex: 0 0 auto !important;
          flex-wrap: nowrap !important;
          width: 168px !important;
          min-width: 168px !important;
          max-width: 168px !important;
        }
        .host-profile-form-row-2 {
          grid-template-columns: 1fr !important;
        }
        .host-profile-practice-select {
          max-width: 100% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .host-profile-practice-select-desktop {
          display: none !important;
        }
        .host-profile-practice-select-mobile {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
        }
      }
    `;
    document.head.appendChild(s);
  }
}
