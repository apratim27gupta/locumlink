'use client';
import { useState, useEffect, useRef, useCallback, type KeyboardEvent, } from 'react';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { ProfileStatusGlyph, type ProfileStatusGlyphVariant, } from '@/components/ProfileStatusGlyph';
import { uploadFile } from '@/lib/api';
import { useHostProfile } from '@/hooks/useHostProfile';
import type { HostProfile } from '@/types';
import { hostProfileCompletionPct } from '@/lib/hostProfileCompletion';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { isCpsnsNineDigitsFormat, isCpsnsVerified, sanitizeCpsnsInput, } from '@/lib/cpsnsVerify';
import { filterCanadianCities, CANADIAN_PROVINCE_NAMES, formatCanadianCityDisplay, type CanadianCityRow, } from '@/lib/canadianCities';
const NAV = [
    {
        label: 'My Postings',
        href: '/host/dashboard',
        icon: <NavIcon name="postings"/>,
    },
    { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile"/> },
    {
        label: 'Messages',
        href: '/host/messages',
        icon: <NavIcon name="messages"/>,
    },
    {
        label: 'Resources',
        href: '/host/resources',
        icon: <NavIcon name="resources"/>,
    },
];
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
const CITY_MATCH_MARK: React.CSSProperties = {
    background: 'rgba(15,42,122,0.12)',
    color: '#0F2A7A',
    borderRadius: 3,
    padding: '0 2px',
    fontWeight: 700,
};
function highlightCityName(text: string, query: string): React.ReactNode {
    const q = query.trim();
    if (!q)
        return text;
    const lower = text.toLowerCase();
    const lq = q.toLowerCase();
    const idx = lower.indexOf(lq);
    if (idx < 0)
        return text;
    return (<>
      {text.slice(0, idx)}
      <mark style={CITY_MATCH_MARK}>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>);
}
const SPECIALITY_OPTIONS = [
    'Emergency Medicine',
    'Anaesthetics',
    'Family Physician',
    'General Practice',
    'Internal medicine',
    'Paediatrics',
    'ENT',
    'Psychiatry',
    'Radiology',
];
type StepStatus = 'upcoming' | 'active' | 'complete' | 'incomplete';
function stepBorderColor(s: StepStatus) {
    if (s === 'active')
        return '#3B4FD8';
    if (s === 'complete')
        return '#16a34a';
    if (s === 'incomplete')
        return '#f97316';
    return '#e2e5ee';
}
function stepCircleBg(s: StepStatus) {
    if (s === 'active')
        return '#3B4FD8';
    if (s === 'complete')
        return '#16a34a';
    if (s === 'incomplete')
        return '#f97316';
    return '#e2e5ee';
}
function stepLabelColor(s: StepStatus) {
    if (s === 'active')
        return '#3B4FD8';
    if (s === 'complete')
        return '#16a34a';
    if (s === 'incomplete')
        return '#f97316';
    return '#8892a4';
}
function sectionCard(highlighted: boolean, opts?: {
    gap?: number;
    height?: number;
    borderRadius?: number;
}): React.CSSProperties {
    return {
        background: '#fff',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '32px 24px',
        gap: opts?.gap ?? 24,
        width: 1180,
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
    const verified = isCpsnsVerified(profile?.cpsnsNumber);
    const welcomeDoctorLabel = profile?.contactFirstName || profile?.contactLastName
        ? `Dr ${(profile?.contactFirstName ?? '').trim()} ${(profile?.contactLastName ?? '').trim()}`.trim()
        : '';
    const [clinicName, setClinicName] = useState('');
    const [contactFirst, setContactFirst] = useState('');
    const [contactLast, setContactLast] = useState('');
    const [hostFirst, setHostFirst] = useState('');
    const [hostLast, setHostLast] = useState('');
    const [cpsns, setCpsns] = useState('');
    const [licenseFile, setLicenseFile] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [specialtyInput, setSpecialtyInput] = useState('');
    const [specialtyDropdownOpen, setSpecialtyDropdownOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [addr1, setAddr1] = useState('');
    const [addr2, setAddr2] = useState('');
    const [postal, setPostal] = useState('');
    const [city, setCity] = useState('');
    const [province, setProvince] = useState('');
    const [practiceType, setPracticeType] = useState('');
    const [numPhysicians, setNumPhysicians] = useState('');
    const [emr, setEmr] = useState('');
    const [patientVol, setPatientVol] = useState('');
    const [clinicDesc, setClinicDesc] = useState('');
    const [amenities, setAmenities] = useState<string[]>([]);
    const [accommodation, setAccommodation] = useState(false);
    const [customAmenity, setCustomAmenity] = useState('');
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
    const hostCityDropRef = useRef<HTMLDivElement>(null);
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
        if (!hostCityDropOpen)
            return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHostCityActiveIdx((i) => Math.min(i + 1, hostCityResults.length - 1));
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHostCityActiveIdx((i) => Math.max(i - 1, 0));
        }
        if (e.key === 'Enter' &&
            hostCityActiveIdx >= 0 &&
            hostCityResults[hostCityActiveIdx]) {
            e.preventDefault();
            handleHostCitySelect(hostCityResults[hostCityActiveIdx]);
        }
        if (e.key === 'Escape')
            setHostCityDropOpen(false);
    }
    useEffect(() => {
        if (!profile)
            return;
        setClinicName(profile.clinicName ?? '');
        setContactFirst(profile.contactFirstName ?? '');
        setContactLast(profile.contactLastName ?? '');
        setHostFirst(profile.contactFirstName ?? '');
        setHostLast(profile.contactLastName ?? '');
        setCpsns(profile.cpsnsNumber ?? '');
        setLicenseFile(profile.licenseFile ?? null);
        setSpecialties(profile.speciality
            ? profile.speciality
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : []);
        setAddr1(profile.address1 ?? '');
        setAddr2(profile.address2 ?? '');
        setPostal(profile.postalCode ?? '');
        setCity(formatCanadianCityDisplay(profile.city ?? ''));
        setProvince(profile.province ?? '');
        setPracticeType(profile.practiceType ?? '');
        setNumPhysicians(profile.numPhysicians ?? '');
        setEmr(profile.emr ?? '');
        setPatientVol(profile.patientVol ?? '');
        setClinicDesc(profile.clinicDesc ?? '');
        setAmenities(profile.amenities ?? []);
        setAccommodation(profile.accommodationProvided ?? false);
    }, [profile]);
    useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (hostCityDropRef.current?.contains(t) ||
                hostCityInputRef.current?.contains(t)) {
                return;
            }
            setHostCityDropOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, []);
    useEffect(() => () => {
        if (hostCityBlurTimer.current != null) {
            clearTimeout(hostCityBlurTimer.current);
        }
    }, []);
    const derivedContactFirst = (contactFirst || hostFirst).trim();
    const derivedContactLast = (contactLast || hostLast).trim();
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
        practiceType,
        numPhysicians,
        emr,
        patientVol,
        clinicDesc,
        amenities,
        accommodationProvided: accommodation,
    });
    const allDone = progressPct === 100;
    const completionGlyphVariant: ProfileStatusGlyphVariant = !allDone
        ? 'incomplete'
        : verified
            ? 'verified'
            : 'underReview';
    const completionTitle = !allDone
        ? 'Complete your profile to find Locums'
        : verified
            ? 'Your profile is complete and verified'
            : 'Your profile is complete — CPSNS under verification';
    const completionSubtitle = !allDone
        ? `${progressPct}% completed`
        : verified
            ? '100% completed · CPSNS verified'
            : '100% completed · Awaiting manual CPSNS verification';
    const stepComplete = [
        !!(clinicName &&
            derivedContactFirst &&
            derivedContactLast &&
            isCpsnsNineDigitsFormat(cpsns) &&
            specialties.length),
        !!(addr1 && postal && city && province),
        !!(practiceType && numPhysicians && emr && patientVol),
        amenities.length > 0,
    ];
    function getStatus(n: number): StepStatus {
        if (activeStep === n)
            return 'active';
        if (stepComplete[n - 1])
            return 'complete';
        if (visited.has(n))
            return 'incomplete';
        return 'upcoming';
    }
    function goToStep(n: number) {
        setVisited((v) => new Set([...v, n]));
        setActiveStep(n);
        const idx = n - 1;
        const run = () => {
            stepSectionRefs.current[idx]?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        };
        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(run);
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
        }
        catch {
            setSaveError('Could not save. Please try again.');
        }
    }
    if (loading) {
        return (<DashLayout navItems={NAV} activeHref="/host/profile" topbarFirstName={profile?.contactFirstName} topbarLastName={profile?.contactLastName}>
        <div style={{
                padding: '40px 36px',
                fontFamily: 'Inter, sans-serif',
                color: '#8892a4',
                fontSize: 14,
            }}>
          Loading profile…
        </div>
      </DashLayout>);
    }
    return (<DashLayout navItems={NAV} activeHref="/host/profile" topbarFirstName={profile?.contactFirstName} topbarLastName={profile?.contactLastName}>
      <div style={{
            padding: '28px 36px 60px',
            maxWidth: 1180,
            fontFamily: 'Inter, sans-serif',
            boxSizing: 'border-box',
            position: 'relative',
        }}>
        
        <div style={{
            width: 850,
            height: 56,
            position: 'relative',
            marginBottom: 16,
        }}>
          <div style={{
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
        }}>
            Welcome{welcomeDoctorLabel ? ` ${welcomeDoctorLabel}` : ''}
          </div>
          <div style={{
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
        }}>
            
          </div>
        </div>

        
        <div style={{
            width: '100%',
            height: 104,
            background: 'rgba(209, 213, 219, 0.3)',
            borderRadius: 10,
            marginBottom: 16,
            position: 'relative',
            overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            left: 24,
            right: 24,
            top: 26,
            height: 52,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 24,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{ width: 52, height: 52, flexShrink: 0 }}>
                <ProfileStatusGlyph variant={completionGlyphVariant} size={52}/>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'normal',
            fontWeight: 500,
            fontSize: 22,
            lineHeight: '124%',
            color: 'rgba(21, 20, 20, 0.7)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }}>
                  {completionTitle}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: 18,
            lineHeight: '100%',
            color: '#606061',
        }}>
                    {completionSubtitle}
                  </div>
                </div>
              </div>
            </div>

            
            <div style={{ width: 1, height: 1 }}/>
          </div>
        </div>

        
        {allDone && !verified && (<div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 20,
            }}>
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
          </div>)}
        {allDone && verified && (<div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 20,
            }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>
                CPSNS verified
              </div>
              <div style={{ fontSize: 12, color: '#047857' }}>
                Your registration has been manually verified. You can post jobs.
              </div>
            </div>
          </div>)}

        
        <div style={{
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
        }}>
          <div style={{
            position: 'relative',
            width: 1132,
            height: 48,
            left: 0,
            top: 0,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
        }}>
            {steps.map((s) => {
            const isActive = activeStep === s.n;
            const isCompleted = activeStep > s.n;
            const circleBg = isActive ? '#1522A6' : '#fff';
            const circleBorder = isActive
                ? 'none'
                : '1px solid rgba(21, 20, 20, 0.4)';
            const circleColor = isActive ? '#FFFFFF' : '#6B7280';
            return (<div key={s.n} onClick={() => goToStep(s.n)} style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    width: 274,
                    minHeight: 48,
                    cursor: 'pointer',
                    flex: 'none',
                    boxSizing: 'border-box',
                }}>
                  <div style={{
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
                }}>
                    {isCompleted ? '✓' : s.n}
                  </div>

                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 4,
                    alignItems: 'flex-start',
                }}>
                    <div style={{
                    fontFamily: 'Inter, sans-serif',
                    fontStyle: 'normal',
                    fontWeight: 500,
                    fontSize: 20,
                    lineHeight: '124%',
                    color: '#0B0F1F',
                    textAlign: 'left',
                }}>
                      {s.label}
                    </div>
                  </div>

                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#210840" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{
                    flexShrink: 0,
                    transform: 'rotate(-90deg)',
                }} aria-hidden="true">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>);
        })}

            
            <div style={{
            position: 'absolute',
            left: (activeStep - 1) * 286,
            top: 64,
            width: 256,
            height: 6,
            background: 'linear-gradient(270deg, #3A65DB 0%, #1B31D2 100%)',
        }}/>
            <div style={{
            position: 'absolute',
            left: (activeStep - 1) * 286 + 256,
            top: 69,
            right: 0,
            height: 1,
            background: '#D1D5DB',
        }}/>
          </div>
        </div>

        
        <div style={{
            width: 1180,
            minHeight: 1905,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: 0,
            gap: 24,
            boxSizing: 'border-box',
        }}>
        
        <div id="host-profile-step-1" ref={(el) => {
            stepSectionRefs.current[0] = el;
        }} style={{
            ...sectionCard(activeStep === 1, { gap: 24 }),
            minHeight: 820,
            scrollMarginTop: 20,
        }} onClick={() => goToStep(1)}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#0B0F1F' }}>
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 20c0-3.866 3.582-7 8-7s8 3.134 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1,
            color: '#0B0F1F',
        }}>
              Basic Information
            </span>
          </div>

          
          <div style={{ width: '100%' }}>
            <p style={{
            fontSize: 22,
            fontWeight: 500,
            lineHeight: '140%',
            color: '#0B0F1F',
            marginBottom: 20,
        }}>
              Clinic Information
            </p>

            <div style={{ display: 'flex', flexDirection: 'row', gap: 40 }}>
              <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
        }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Clinic name
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
            fontFamily: 'Inter, sans-serif',
        }} value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="Enter clinic name"/>
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: 1, background: '#EBEBEB' }}/>

          
          <div style={{
            width: '100%',
            display: 'flex',
            gap: 40,
            alignItems: 'stretch',
            flex: '1 1 auto',
            minHeight: 560,
        }}>
            <div style={{
            flex: '1 1 0%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
        }}>
              <p style={{
            fontSize: 22,
            fontWeight: 500,
            lineHeight: '140%',
            color: '#0B0F1F',
        }}>
                Host Doctors
              </p>

              <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 12px',
            background: 'rgba(115, 177, 251, 0.12)',
            borderRadius: 2,
            gap: 12,
        }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
            width: 46,
            height: 46,
            background: '#EEF6FF',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="8" r="4" stroke="#0B0F1F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 20c0-3.866 3.582-7 8-7s8 3.134 8 7" stroke="#0B0F1F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{
            fontSize: 20,
            fontWeight: 500,
            color: '#0B0F1F',
            lineHeight: 1,
        }}>
                      {hostFirst || hostLast
            ? `${hostFirst} ${hostLast}`.trim()
            : 'Host Doctor 1'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 400, color: '#6B7280' }}>
                      Just Now
                    </span>
                  </div>
                </div>

                <button type="button" onClick={(e) => e.stopPropagation()} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            height: 44,
            border: '1px solid #3A65DB',
            borderRadius: 3,
            background: 'transparent',
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 500,
            color: '#3A65DB',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
        }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1v12M1 7h12" stroke="#3A65DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Add Host
                </button>
              </div>
            </div>

            <div style={{
            flex: '1 1 0%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
        }}>
              
              <div style={{
            width: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
        }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Name
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
            fontFamily: 'Inter, sans-serif',
        }} value={hostFirst} onChange={(e) => setHostFirst(e.target.value)} placeholder="First name"/>
                  <input style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
            fontFamily: 'Inter, sans-serif',
        }} value={hostLast} onChange={(e) => setHostLast(e.target.value)} placeholder="Last name"/>
                </div>
              </div>

              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  CPSNS Number *
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
            fontFamily: 'Inter, sans-serif',
        }} inputMode="numeric" autoComplete="off" maxLength={9} value={cpsns} onChange={(e) => setCpsns(sanitizeCpsnsInput(e.target.value))} placeholder="9-digit number"/>
              </div>

              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  CPSNS License
                </label>

                {licenseFile ? (<div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                height: 56,
                border: '1px solid #22C55E',
                borderRadius: 4,
                background: '#fff',
            }}>
                    <span style={{ fontSize: 16, fontWeight: 400, color: '#0B0F1F' }}>
                      {uploading
                ? 'Uploading…'
                : (licenseFile?.split('/').pop() ?? licenseFile)}
                    </span>
                    <button type="button" onClick={(e) => {
                e.stopPropagation();
                setLicenseFile(null);
            }} style={{
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
            }} title="Remove file">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 4h12" stroke="#210840" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="#210840" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="#210840" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M6.5 7.5v4M9.5 7.5v4" stroke="#210840" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>) : (<>
                    <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file)
                    return;
                setUploading(true);
                try {
                    const result = await uploadFile(file, 'host/license');
                    setLicenseFile(result.path);
                }
                catch {
                    alert('Upload failed. Try again.');
                }
                finally {
                    setUploading(false);
                    e.target.value = '';
                }
            }}/>
                    <button type="button" onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
            }} disabled={uploading} style={{
                width: '100%',
                height: 44,
                padding: '6px 10px',
                border: '1px solid #D0D5DD',
                borderRadius: 4,
                background: '#fff',
                cursor: uploading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 10,
                userSelect: 'none',
                opacity: uploading ? 0.7 : 1,
            }}>
                      <Image src="/relevant-docs.png" alt="" width={18} height={18} style={{ objectFit: 'contain', flexShrink: 0, opacity: 0.9 }}/>
                      <span style={{ fontSize: 16, color: 'rgba(11, 15, 31, 0.4)' }}>
                        {uploading ? 'Uploading…' : 'Upload CPSNS Certificate'}
                      </span>
                    </button>
                  </>)}
              </div>

              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Speciality *
                </label>

                <div style={{ position: 'relative' }}>
                  <button type="button" onClick={(e) => {
            e.stopPropagation();
            setSpecialtyDropdownOpen((v) => !v);
        }} style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            height: 44,
            border: '1px solid #D0D5DD',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
        }}>
                    <span style={{
            fontSize: 16,
            fontWeight: 400,
            color: specialties.length
                ? 'rgba(11, 15, 31, 0.8)'
                : 'rgba(11, 15, 31, 0.4)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
        }}>
                      {specialties.length ? specialties.join(', ') : 'Pick Speciality'}
                    </span>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M4.5 6.75L9 11.25l4.5-4.5" stroke="#0B0F1F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {specialtyDropdownOpen && (<div onClick={(e) => e.stopPropagation()} style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 50,
                background: '#fff',
                border: '1px solid #D0D5DD',
                borderRadius: 8,
                padding: 12,
                zIndex: 30,
            }}>
                      <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#0B0F1F',
                marginBottom: 8,
            }}>
                        Custom title
                      </div>

                      <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                marginBottom: 10,
                maxHeight: 180,
                overflowY: 'auto',
                paddingRight: 2,
            }}>
                        {SPECIALITY_OPTIONS.map((opt) => {
                const selected = specialties.includes(opt);
                return (<button key={opt} type="button" onClick={(e) => {
                        e.stopPropagation();
                        setSpecialties((sp) => sp.includes(opt) ? sp : [...sp, opt]);
                    }} style={{
                        all: 'unset',
                        cursor: 'pointer',
                        padding: '10px 10px',
                        borderRadius: 6,
                        border: `1px solid ${selected ? 'rgba(21, 34, 166, 0.35)' : '#E5E7EB'}`,
                        background: selected
                            ? 'rgba(115, 177, 251, 0.12)'
                            : '#fff',
                        color: '#0B0F1F',
                        fontSize: 14,
                        fontWeight: 500,
                    }}>
                              {opt}
                            </button>);
            })}
                      </div>

                      <input style={{
                width: '100%',
                height: 44,
                padding: '6px 8px',
                border: '1px solid #D0D5DD',
                borderRadius: 4,
                fontSize: 16,
                fontWeight: 400,
                color: '#0B0F1F',
                background: '#fff',
                outline: 'none',
                fontFamily: 'Inter, sans-serif',
            }} value={specialtyInput} onChange={(e) => setSpecialtyInput(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'Enter' && specialtyInput.trim()) {
                    e.stopPropagation();
                    setSpecialties((sp) => [...sp, specialtyInput.trim()]);
                    setSpecialtyInput('');
                }
            }} placeholder="Type speciality and press Enter"/>
                    </div>)}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                  {specialties.map((s) => (<span key={s} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 12px',
                height: 36,
                background: 'rgba(115, 177, 251, 0.1)',
                borderRadius: 40,
                fontSize: 16,
                fontWeight: 400,
                color: '#1522A6',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
            }}>
                      {s}
                      <button type="button" onClick={(e) => {
                e.stopPropagation();
                setSpecialties((sp) => sp.filter((x) => x !== s));
            }} style={{
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
            }} aria-label={`Remove ${s}`}>
                        ✕
                      </button>
                    </span>))}
                </div>
              </div>
            </div>
          </div>
        </div>

        
        <div id="host-profile-step-2" ref={(el) => {
            stepSectionRefs.current[1] = el;
        }} style={{
            ...sectionCard(activeStep === 2, { gap: 16, height: 392 }),
            scrollMarginTop: 20,
        }} onClick={() => goToStep(2)}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#0B0F1F' }}>
              <path d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span style={{
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1,
            color: '#0B0F1F',
        }}>
              Clinic Location
            </span>
          </div>

          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            width: '100%',
        }}>
            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 80, width: '100%' }}>
              <div style={{ width: 524, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 400,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Address Line 1
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }} value={addr1} onChange={(e) => setAddr1(e.target.value)} placeholder="Location Address Line 1"/>
              </div>
              <div style={{ width: 412, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 400,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Address Line 2
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }} value={addr2} onChange={(e) => setAddr2(e.target.value)} placeholder="Location Address Line 2"/>
              </div>
            </div>

            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 80, width: '100%' }}>
              <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            position: 'relative',
        }}>
                <label htmlFor="host-profile-city" style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  City
                </label>
                <input id="host-profile-city" ref={hostCityInputRef} autoComplete="off" style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 4,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
            boxSizing: 'border-box',
        }} value={city} onChange={(e) => {
            setCity(e.target.value);
            setProvince('');
            searchHostCities(e.target.value);
        }} onKeyDown={handleHostCityKeyDown} onFocus={() => {
            if (hostCityBlurTimer.current != null) {
                clearTimeout(hostCityBlurTimer.current);
            }
            if (city.trim().length >= 2) {
                searchHostCities(city);
            }
            else if (hostCityResults.length) {
                setHostCityDropOpen(true);
            }
        }} onBlur={(e) => {
            setCity(formatCanadianCityDisplay(e.target.value));
            hostCityBlurTimer.current = setTimeout(() => setHostCityDropOpen(false), 160);
        }} onClick={(e) => e.stopPropagation()} placeholder="Start typing city…"/>
                {hostCityDropOpen && (<div ref={hostCityDropRef} style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 40,
                background: '#fff',
                border: '1px solid #E4E8F0',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(15,42,122,0.13)',
                maxHeight: 220,
                overflowY: 'auto',
            }}>
                    {hostCityResults.length === 0 ? (<div style={{
                    padding: '14px',
                    fontSize: 13,
                    color: 'rgba(11,15,31,0.45)',
                    textAlign: 'center',
                }}>
                        No city found
                      </div>) : (hostCityResults.map((row, i) => (<div key={`${row.name}-${row.province}`} role="option" aria-selected={i === hostCityActiveIdx} onMouseDown={(e) => {
                    e.preventDefault();
                    handleHostCitySelect(row);
                }} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: i === hostCityActiveIdx
                        ? 'rgba(15,42,122,0.05)'
                        : 'transparent',
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                }}>
                          <span style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#0B0F1F',
                }}>
                            {highlightCityName(row.name, city)}
                          </span>
                          <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'rgba(59,198,198,0.12)',
                    color: '#0F6E56',
                    padding: '2px 9px',
                    borderRadius: 20,
                    flexShrink: 0,
                    marginLeft: 8,
                }}>
                            {CANADIAN_PROVINCE_NAMES[row.province] ?? row.province}
                          </span>
                        </div>)))}
                  </div>)}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Province
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 4,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }} value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Add Province"/>
              </div>
            </div>

            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 80, width: '100%' }}>
              <div style={{ width: 524, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 400,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Postal Code
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }} value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="Enter valid 6 digit code"/>
              </div>
            </div>
          </div>
        </div>

        
        <div id="host-profile-step-3" ref={(el) => {
            stepSectionRefs.current[2] = el;
        }} style={{
            ...sectionCard(activeStep === 3, { gap: 24, height: 396 }),
            scrollMarginTop: 20,
        }} onClick={() => goToStep(3)}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#0B0F1F' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{
            fontWeight: 600,
            fontSize: 24,
            lineHeight: 1,
            color: '#0B0F1F',
        }}>
              Practice Details
            </span>
          </div>

          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            width: '100%',
        }}>
            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 40, width: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Practice Type
                </label>
                <div style={{ position: 'relative' }}>
                  <select style={{
            width: '100%',
            height: 44,
            padding: '6px 36px 6px 8px',
            border: '1px solid rgba(21, 20, 20, 0.2)',
            borderRadius: 4,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
            appearance: 'none',
        }} value={practiceType} onChange={(e) => setPracticeType(e.target.value)}>
                  <option value="" disabled>
                    Select practice type
                  </option>
                  <option value="Collaborative Family Practice">
                    Collaborative Family Practice
                  </option>
                  <option value="Primary Care Clinic">Primary Care Clinic</option>
                  <option value="Virtual Care Clinic">Virtual Care Clinic</option>
                  <option value="Traditional Fee for Service Practice">
                    Traditional Fee for Service Practice
                  </option>
                  <option value="Nurse Practitioner (NP) Clinic">
                    Nurse Practitioner (NP) Clinic
                  </option>
                  <option value="More">More</option>
                </select>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: '#6B7280',
        }} aria-hidden="true">
                    <path d="M4.5 6.75L9 11.25l4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  No. of Physicians
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid rgba(21, 20, 20, 0.2)',
            borderRadius: 4,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }} value={numPhysicians} onChange={(e) => setNumPhysicians(e.target.value)} placeholder="..."/>
              </div>
            </div>

            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 40, width: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  EMR System
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid rgba(21, 20, 20, 0.2)',
            borderRadius: 4,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }} value={emr} onChange={(e) => setEmr(e.target.value)} placeholder="..."/>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Patient Volume
                </label>
                <input style={{
            width: '100%',
            height: 44,
            padding: '6px 8px',
            border: '1px solid rgba(21, 20, 20, 0.2)',
            borderRadius: 4,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }} value={patientVol} onChange={(e) => setPatientVol(e.target.value)} placeholder="..."/>
              </div>
            </div>

            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 40, width: '100%' }}>
              <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
            fontSize: 20,
            fontWeight: 500,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                  Clinic description
                </label>
                <textarea style={{
            width: '100%',
            height: 56,
            padding: '6px 8px',
            border: '1px solid rgba(21, 20, 20, 0.2)',
            borderRadius: 4,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
            resize: 'vertical',
            lineHeight: '140%',
        }} value={clinicDesc} onChange={(e) => setClinicDesc(e.target.value)} placeholder="..."/>
              </div>
            </div>
          </div>
        </div>

        
        <div id="host-profile-step-4" ref={(el) => {
            stepSectionRefs.current[3] = el;
        }} style={{
            ...sectionCard(activeStep === 4, { gap: 24, borderRadius: 4 }),
            scrollMarginTop: 20,
        }} onClick={() => goToStep(4)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B0F1F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l2.6-2.6a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0z"/>
              <path d="M10.2 7.8 2 16v6h6l8.2-8.2"/>
              <path d="M16 5 19 8"/>
            </svg>
            <div style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'normal',
            fontWeight: 600,
            fontSize: 24,
            lineHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            color: '#0B0F1F',
        }}>
              Services Offered
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <div style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'normal',
            fontWeight: 500,
            fontSize: 20,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
              Amenities
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 713 }}>
              {(() => {
            const all = [
                ...AMENITY_OPTIONS,
                ...amenities.filter((a) => !AMENITY_OPTIONS.includes(a)),
            ];
            const seen = new Set<string>();
            const unique = all.filter((a) => {
                if (seen.has(a))
                    return false;
                seen.add(a);
                return true;
            });
            const picked = unique.filter((a) => amenities.includes(a));
            const rest = unique.filter((a) => !amenities.includes(a));
            return [...picked, ...rest];
        })().map((a) => (<span key={a} onClick={(e) => {
                e.stopPropagation();
                setAmenities((am) => am.includes(a) ? am.filter((x) => x !== a) : [...am, a]);
            }} style={{
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
            }}>
                  {a}
                  {amenities.includes(a) && (<span style={{ marginLeft: 10, fontSize: 14, lineHeight: '14px' }}>×</span>)}
                </span>))}
            </div>

            <input value={customAmenity} onChange={(e) => setCustomAmenity(e.target.value)} onKeyDown={(e) => {
            if (e.key !== 'Enter')
                return;
            e.preventDefault();
            const v = customAmenity.trim();
            if (!v)
                return;
            e.stopPropagation();
            setAmenities((am) => (am.includes(v) ? am : [...am, v]));
            setCustomAmenity('');
        }} placeholder="Add custom amenity and press Enter" style={{
            width: '100%',
            maxWidth: 713,
            height: 44,
            padding: '6px 8px',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontWeight: 400,
            color: '#0B0F1F',
            background: '#fff',
            outline: 'none',
        }}/>

            <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            userSelect: 'none',
        }}>
              <input type="checkbox" checked={accommodation} onChange={(e) => setAccommodation(e.target.checked)} style={{
            width: 14,
            height: 14,
            border: '1px solid rgba(21, 20, 20, 0.4)',
            borderRadius: 4,
            accentColor: '#1522A6',
        }}/>
              <span style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: 20,
            lineHeight: '140%',
            color: 'rgba(11, 15, 31, 0.8)',
        }}>
                Accommodation provided for Locum
              </span>
            </label>
          </div>
        </div>

        
        {saved && (<div style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 12,
                fontSize: 13,
                color: '#166534',
            }}>
            ✓ Profile saved successfully.
          </div>)}
        {saveError && (<div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 12,
                fontSize: 13,
                color: '#dc2626',
            }}>
            {saveError}
          </div>)}

        <button onClick={handleSave} disabled={saving} style={{
            padding: '10px 28px',
            background: saving ? '#a5b4fc' : '#3B4FD8',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? 'Saving…' : 'Done'}
        </button>
        </div>
      </div>
    </DashLayout>);
}
