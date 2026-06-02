'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { HomeLandingView } from '@/components/HomeLandingView';
import { HostSetupStep3 } from '@/components/HostSetupStep3';
import { useAuth } from '@/providers/AuthProvider';
import { getToken } from '@/lib/auth';
import { hostApi } from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { HostProfile } from '@/types';
import { normalizeCpsns } from '@/lib/cpsnsVerify';
import {
  CANADIAN_CITY_ROWS,
  CANADIAN_PROVINCE_NAMES,
  filterCanadianCities,
  formatCanadianCityDisplay,
  type CanadianCityRow,
} from '@/lib/canadianCities';
import BarWaveButton from '@/components/ui/BarWaveButton';
import { dispatchProfileUpdated } from '@/lib/profileUpdatedEvent';
import { beforeClientNavigation } from '@/lib/topLoader';
import { sortStringsLocale } from '@/lib/sortLocale';

const HOST_SETUP_MODAL = {
  widthPx: 476,
  heightPx: 790,
  maxHeight: 'calc(100vh - 40px)',
  paddingPx: 32,
  borderRadiusPx: 10,
  contentWidthPx: 412,
  headerHeightPx: 100,
  headerHeightStep3Px: 132,
  formToActionsGapPx: 16,
  formToActionsGapStep2Px: 28,
  formToActionsGapStep3Px: 28,
  bodyTopGapPx: 24,
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)',
} as const;

const SPECIALITY_OPTIONS = sortStringsLocale([
  'Family Physician',
  'Internal medicine',
  'Emergency',
  'ENT',
  'Emergency Medicine',
  'Anaesthetics',
  'Paediatrics',
]);

function parseSpecialities(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const inp: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '6px 8px',
  border: '1px solid #D0D5DD',
  borderRadius: 8,
  fontSize: 16,
  lineHeight: '140%',
  color: '#0B0F1F',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
};

const inpStep2: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #D0D5DD',
  borderRadius: 8,
  fontSize: 16,
  lineHeight: '140%',
  color: '#0B0F1F',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 20,
  fontWeight: 400,
  lineHeight: '140%',
  color: 'rgba(11, 15, 31, 0.8)',
  marginBottom: 8,
};

const CITY_MATCH_MARK: React.CSSProperties = {
  background: 'rgba(15, 42, 122, 0.12)',
  color: '#0F2A7A',
  borderRadius: 3,
  padding: '0 2px',
  fontWeight: 700,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 500,
  lineHeight: '140%',
  color: '#0B0F1F',
};

const sectionTitleMuted: React.CSSProperties = {
  ...sectionTitle,
  color: '#4A4A4A',
};

const hostSetupModalCardBase: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  boxSizing: 'border-box',
  width: HOST_SETUP_MODAL.widthPx,
  height: HOST_SETUP_MODAL.heightPx,
  maxHeight: HOST_SETUP_MODAL.maxHeight,
  background: '#FFFFFF',
  borderRadius: HOST_SETUP_MODAL.borderRadiusPx,
  padding: HOST_SETUP_MODAL.paddingPx,
  boxShadow: HOST_SETUP_MODAL.boxShadow,
  zIndex: 10,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Inter', var(--font-family-body, DM Sans, sans-serif)",
};

type ProvinceOption = {
  code: string;
  name: string;
};

const PROVINCE_OPTIONS: ProvinceOption[] = Array.from(
  new Set(CANADIAN_CITY_ROWS.map((city) => city.province)),
)
  .map((code) => ({
    code,
    name: CANADIAN_PROVINCE_NAMES[code] ?? code,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

function highlightCityName(text: string, query: string): ReactNode {
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

export default function HostSetupPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const router = useRouter();
  const { completeProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<HostProfile>({
    clinicName: '',
    contactFirstName: '',
    contactLastName: '',
    cpsnsNumber: '',
    speciality: '',
    address1: '',
    address2: '',
    postalCode: '',
    city: '',
    province: '',
    amenities: [],
    accommodationProvided: false,
  });
  const [specialityTags, setSpecialityTags] = useState<string[]>([]);
  const [addingCustomSpeciality, setAddingCustomSpeciality] = useState(false);
  const [customSpeciality, setCustomSpeciality] = useState('');
  const customSpecialityRef = useRef<HTMLInputElement>(null);
  const [cityResults, setCityResults] = useState<CanadianCityRow[]>([]);
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [cityActiveIdx, setCityActiveIdx] = useState(-1);
  const cityBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [provinceResults, setProvinceResults] =
    useState<ProvinceOption[]>(PROVINCE_OPTIONS);
  const [provinceDropOpen, setProvinceDropOpen] = useState(false);
  const [provinceActiveIdx, setProvinceActiveIdx] = useState(-1);
  const provinceBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    setSpecialityTags(parseSpecialities(form.speciality));
  }, []);
  // Load saved profile on mount
  useEffect(() => {
    void (async () => {
      try {
        const saved = await hostApi.getProfile();
        if (saved) {
          setForm((f) => ({ ...f, ...saved }));
          if (saved.speciality) {
            setSpecialityTags(parseSpecialities(saved.speciality));
          }
          completeProfile();
        }
      } catch {
        // No saved profile yet, start fresh
      }
    })();
  }, []);

  // Auto-save functionality
  useEffect(() => {
    // Clear previous timer
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    // Set new timer for auto-save
    autoSaveTimer.current = setTimeout(() => {
      handleAutoSave();
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [form, specialityTags]);

  async function handleAutoSave() {
    try {
      setAutoSaving(true);
      // Only save if there's some data
      if (
        form.clinicName.trim().length > 0 ||
        form.contactFirstName.trim().length > 0 ||
        form.address1.trim().length > 0
      ) {
        await hostApi.saveProfile(form);
        console.log('Profile auto-saved successfully');
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      // Don't show error to user for auto-save failures
    } finally {
      setAutoSaving(false);
    }
  }

  async function handleExitWithConfirmation() {
    // Check if form has any data
    const hasData =
      form.clinicName.trim().length > 0 ||
      form.contactFirstName.trim().length > 0 ||
      form.address1.trim().length > 0 ||
      form.city.trim().length > 0;

    if (hasData) {
      setShowExitConfirm(true);
    } else {
      // No data, just navigate away
      await handleAutoSave();
      navigateToHome();
    }
  }

  async function confirmedExit() {
    setShowExitConfirm(false);
    await handleAutoSave();
    navigateToHome();
  }

  function cancelExit() {
    setShowExitConfirm(false);
  }

  function navigateToHome() {
    beforeClientNavigation('/');
    router.push('/?skipSetup=1');
  }

  const step1Valid = useMemo(
    () =>
      form.clinicName.trim().length > 0 &&
      form.contactFirstName.trim().length > 0,
    [form.clinicName, form.contactFirstName],
  );

  function set<K extends keyof HostProfile>(k: K, v: HostProfile[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

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

  function handleCitySelect(city: CanadianCityRow) {
    set('city', formatCanadianCityDisplay(city.name));
    set('province', CANADIAN_PROVINCE_NAMES[city.province] ?? city.province);
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
    if (
      e.key === 'Enter' &&
      cityActiveIdx >= 0 &&
      cityResults[cityActiveIdx]
    ) {
      e.preventDefault();
      handleCitySelect(cityResults[cityActiveIdx]);
    }
    if (e.key === 'Escape') setCityDropOpen(false);
  }

  const searchProvinces = useCallback((q: string) => {
    const lower = q.trim().toLowerCase();
    const found = lower
      ? PROVINCE_OPTIONS.filter(
          (province) =>
            province.name.toLowerCase().includes(lower) ||
            province.code.toLowerCase().includes(lower),
        )
      : PROVINCE_OPTIONS;

    setProvinceResults(found);
    setProvinceActiveIdx(-1);
    setProvinceDropOpen(true);
  }, []);

  function handleProvinceSelect(province: ProvinceOption) {
    set('province', province.name);
    setProvinceResults(PROVINCE_OPTIONS);
    setProvinceDropOpen(false);
  }

  function handleProvinceKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!provinceDropOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setProvinceActiveIdx((i) =>
        Math.min(i + 1, provinceResults.length - 1),
      );
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setProvinceActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (
      e.key === 'Enter' &&
      provinceActiveIdx >= 0 &&
      provinceResults[provinceActiveIdx]
    ) {
      e.preventDefault();
      handleProvinceSelect(provinceResults[provinceActiveIdx]);
    }
    if (e.key === 'Escape') setProvinceDropOpen(false);
  }

  function updateSpecialityTags(tags: string[]) {
    setSpecialityTags(tags);
    setForm((f) => ({ ...f, speciality: tags.join(', ') }));
  }

  function confirmCustomSpeciality() {
    const t = customSpeciality.trim();
    if (t && !specialityTags.includes(t)) {
      updateSpecialityTags([...specialityTags, t]);
    }
    setCustomSpeciality('');
    setAddingCustomSpeciality(false);
  }

  async function handleFinish() {
    setBusy(true);
    setErr('');
    try {
      await hostApi.saveProfile(form);
      completeProfile();
      dispatchProfileUpdated();
      if (typeof window !== 'undefined') {
        window.location.assign('/host/dashboard');
      } else {
        beforeClientNavigation('/host/dashboard');
        router.replace('/host/dashboard');
      }
    } catch (e: unknown) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Could not save profile. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'var(--font-family-body, DM Sans, sans-serif)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <HomeLandingView
          interactive={false}
          rootStyle={{ height: '100%', maxHeight: '100%' }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(47, 71, 160, 0.45)',
          zIndex: 1,
        }}
      />

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '32px',
              maxWidth: 400,
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: 20,
                fontWeight: 600,
                color: '#0B0F1F',
              }}
            >
              Leave Setup?
            </h3>
            <p
              style={{
                margin: '0 0 28px 0',
                fontSize: 16,
                color: '#6B7280',
                lineHeight: '1.5',
              }}
            >
              Your profile has been auto-saved. Are you sure you want to leave?
            </p>
            <div
              style={{
                display: 'flex',
                gap: 12,
              }}
            >
              <button
                onClick={cancelExit}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: '1px solid #D0D5DD',
                  borderRadius: 8,
                  background: '#fff',
                  color: '#5a6478',
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmedExit}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#DC2626',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="setup-modal" style={hostSetupModalCardBase}>
        {/* ── Header ── */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            minHeight:
              step === 3
                ? HOST_SETUP_MODAL.headerHeightStep3Px
                : HOST_SETUP_MODAL.headerHeightPx,
            marginBottom: HOST_SETUP_MODAL.bodyTopGapPx,
          }}
        >
          <button
            type="button"
            onClick={handleExitWithConfirmation}
            aria-label="Close"
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: 36,
              height: 36,
              borderRadius: 38,
              border: 'none',
              background: '#F8F6F7',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              lineHeight: 1,
            }}
          >
            <span
              style={{
                fontSize: 18,
                fontWeight: 300,
                color: '#000000',
                lineHeight: 1,
              }}
            >
              ×
            </span>
          </button>

          {/* Auto-save indicator */}
          {autoSaving && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                fontSize: 12,
                color: '#6B7280',
              }}
            >
              Saving...
            </div>
          )}

          <h2
            style={{
              margin: 0,
              padding: '0 44px',
              textAlign: 'center',
              fontSize: 28,
              fontWeight: 700,
              lineHeight: '100%',
              color: '#0A0A0A',
            }}
          >
            Complete your Profile
          </h2>
          <p
            style={{
              margin: '28px 0 0',
              textAlign: 'center',
              fontSize: 20,
              fontWeight: 400,
              lineHeight: '100%',
              color: '#7C7C7C',
            }}
          >
            Step {step} of 3
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              width: '100%',
              marginTop: 20,
              height: 4,
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  boxSizing: 'border-box',
                  height: 4,
                  borderBottomWidth: 4,
                  borderBottomStyle: 'solid',
                  borderBottomColor: i <= step ? '#0F2AAF' : '#F8F6F7',
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: HOST_SETUP_MODAL.contentWidthPx,
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              {/* ── Step 1 ── */}
              {step === 1 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 24,
                    width: '100%',
                  }}
                >
                  <div style={sectionTitle}>Basic Information</div>
                  <div>
                    <label style={lbl}>Clinic name*</label>
                    <input
                      className="host-setup-input"
                      style={inp}
                      placeholder="Enter Clinic name"
                      value={form.clinicName}
                      onChange={(e) => set('clinicName', e.target.value)}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 24,
                    }}
                  >
                    <div style={sectionTitleMuted}>Host Doctor</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={lbl}>First name*</label>
                        <input
                          className="host-setup-input"
                          style={inp}
                          placeholder="First name"
                          value={form.contactFirstName}
                          onChange={(e) =>
                            set('contactFirstName', e.target.value)
                          }
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={lbl}>Last name</label>
                        <input
                          className="host-setup-input"
                          style={inp}
                          placeholder="Last name"
                          value={form.contactLastName}
                          onChange={(e) =>
                            set('contactLastName', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label style={lbl}>CPSNS Number</label>
                      <input
                        className="host-setup-input"
                        style={inp}
                        placeholder="License number"
                        inputMode="numeric"
                        autoComplete="off"
                        value={form.cpsnsNumber}
                        onChange={(e) =>
                          set('cpsnsNumber', normalizeCpsns(e.target.value))
                        }
                      />
                    </div>

                    {/* Speciality */}
                    <div>
                      <label style={lbl}>Speciality</label>

                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <select
                            className="host-setup-input host-setup-select"
                            style={{
                              ...inp,
                              width: '100%',
                              paddingRight: 36,
                              color: '#0B0F1F',
                            }}
                            value=""
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v && !specialityTags.includes(v)) {
                                updateSpecialityTags([...specialityTags, v]);
                              }
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
                              lineHeight: 1,
                              color: '#000000',
                            }}
                            aria-hidden
                          >
                            ▼
                          </span>
                        </div>

                        {!addingCustomSpeciality && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingCustomSpeciality(true);
                              setTimeout(
                                () => customSpecialityRef.current?.focus(),
                                50,
                              );
                            }}
                            style={{
                              height: 44,
                              padding: '0 12px',
                              border: '1px dashed #3B4FD8',
                              borderRadius: 8,
                              background: 'none',
                              color: '#3B4FD8',
                              fontSize: 13,
                              fontWeight: 500,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            + Custom
                          </button>
                        )}
                      </div>

                      {addingCustomSpeciality && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <input
                            ref={customSpecialityRef}
                            type="text"
                            value={customSpeciality}
                            onChange={(e) =>
                              setCustomSpeciality(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                confirmCustomSpeciality();
                              }
                              if (e.key === 'Escape') {
                                setCustomSpeciality('');
                                setAddingCustomSpeciality(false);
                              }
                            }}
                            placeholder="Type speciality…"
                            style={{
                              flex: 1,
                              height: 38,
                              padding: '4px 8px',
                              border: '1px solid #3B4FD8',
                              borderRadius: 8,
                              fontSize: 15,
                              fontFamily: 'inherit',
                              outline: 'none',
                              color: '#0B0F1F',
                              boxSizing: 'border-box',
                            }}
                          />
                          <button
                            type="button"
                            onClick={confirmCustomSpeciality}
                            style={{
                              padding: '0 14px',
                              height: 38,
                              background: '#0F2A7A',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 500,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomSpeciality('');
                              setAddingCustomSpeciality(false);
                            }}
                            style={{
                              padding: '0 10px',
                              height: 38,
                              background: 'none',
                              color: '#6B7280',
                              border: '1px solid #D0D5DD',
                              borderRadius: 8,
                              fontSize: 13,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignContent: 'flex-start',
                          gap: 12,
                          minHeight: 44,
                          width: '100%',
                        }}
                      >
                        {specialityTags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px',
                              borderRadius: 40,
                              background: 'rgba(115, 177, 251, 0.1)',
                              color: '#1522A6',
                              fontSize: 16,
                              lineHeight: '100%',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() =>
                                updateSpecialityTags(
                                  specialityTags.filter((t) => t !== tag),
                                )
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 8,
                                height: 8,
                                padding: 0,
                                border: '1.5px solid #1522A6',
                                borderRadius: 2,
                                background: 'transparent',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                              aria-label={`Remove ${tag}`}
                            >
                              <span
                                style={{
                                  fontSize: 6,
                                  lineHeight: 1,
                                  color: '#1522A6',
                                  fontWeight: 700,
                                }}
                              >
                                ×
                              </span>
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 2 ── */}
              {step === 2 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    width: '100%',
                  }}
                >
                  <div style={sectionTitle}>Clinic Location</div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 24,
                      width: '100%',
                    }}
                  >
                    {/* Address lines */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          width: '100%',
                        }}
                      >
                        <label style={lbl}>Address Line 1</label>
                        <input
                          style={inpStep2}
                          placeholder="Location Address Line 1"
                          value={form.address1}
                          onChange={(e) => set('address1', e.target.value)}
                        />
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          width: '100%',
                        }}
                      >
                        <label style={lbl}>Address Line 2</label>
                        <input
                          style={inpStep2}
                          placeholder="Location Address Line 2"
                          value={form.address2}
                          onChange={(e) => set('address2', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* City + Province first, Postal Code below */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 12,
                          width: '100%',
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            position: 'relative',
                          }}
                        >
                          <label style={lbl}>City</label>
                          <input
                            style={inpStep2}
                            placeholder="Add City"
                            autoComplete="off"
                            value={form.city}
                            onChange={(e) => {
                              set('city', e.target.value);
                              set('province', '');
                              searchCities(e.target.value);
                            }}
                            onKeyDown={handleCityKeyDown}
                            onFocus={() => {
                              if (cityBlurTimer.current != null) {
                                clearTimeout(cityBlurTimer.current);
                              }
                              if (form.city.trim().length >= 2) {
                                searchCities(form.city);
                              } else if (cityResults.length) {
                                setCityDropOpen(true);
                              }
                            }}
                            onBlur={(e) => {
                              set(
                                'city',
                                formatCanadianCityDisplay(e.target.value),
                              );
                              cityBlurTimer.current = setTimeout(
                                () => setCityDropOpen(false),
                                160,
                              );
                            }}
                          />
                          {cityDropOpen && (
                            <div
                              style={{
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
                              }}
                            >
                              {cityResults.length === 0 ? (
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
                                      borderBottom:
                                        '0.5px solid rgba(0,0,0,0.05)',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: '#0B0F1F',
                                      }}
                                    >
                                      {highlightCityName(row.name, form.city)}
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
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            position: 'relative',
                          }}
                        >
                          <label style={lbl}>Province</label>
                          <input
                            style={{
                              ...inpStep2,
                              background: '#F9FAFB',
                              color: '#374151',
                            }}
                            value={form.province}
                            onChange={(e) => {
                              set('province', e.target.value);
                              searchProvinces(e.target.value);
                            }}
                            onKeyDown={handleProvinceKeyDown}
                            onFocus={() => {
                              if (provinceBlurTimer.current != null) {
                                clearTimeout(provinceBlurTimer.current);
                              }
                              searchProvinces(form.province);
                            }}
                            onBlur={() => {
                              provinceBlurTimer.current = setTimeout(
                                () => setProvinceDropOpen(false),
                                160,
                              );
                            }}
                            placeholder="Province"
                            autoComplete="off"
                          />
                          {provinceDropOpen && (
                            <div
                              style={{
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
                              }}
                            >
                              {provinceResults.length === 0 ? (
                                <div
                                  style={{
                                    padding: '14px',
                                    fontSize: 13,
                                    color: 'rgba(11,15,31,0.45)',
                                    textAlign: 'center',
                                  }}
                                >
                                  No province found
                                </div>
                              ) : (
                                provinceResults.map((province, i) => (
                                  <div
                                    key={province.code}
                                    role="option"
                                    aria-selected={i === provinceActiveIdx}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleProvinceSelect(province);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '10px 14px',
                                      cursor: 'pointer',
                                      background:
                                        i === provinceActiveIdx
                                          ? 'rgba(15,42,122,0.05)'
                                          : 'transparent',
                                      borderBottom:
                                        '0.5px solid rgba(0,0,0,0.05)',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: '#0B0F1F',
                                      }}
                                    >
                                      {highlightCityName(
                                        province.name,
                                        form.province,
                                      )}
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
                                      {province.code}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          width: '100%',
                        }}
                      >
                        <label style={lbl}>Postal Code</label>
                        <input
                          style={inpStep2}
                          placeholder="B0A 1A0 (Nova Scotia)"
                          value={form.postalCode}
                          onChange={(e) =>
                            set('postalCode', e.target.value.toUpperCase())
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 3 ── */}
              {step === 3 && (
                <div className="host-setup-step3-stack">
                  <HostSetupStep3
                    amenities={form.amenities}
                    onAmenitiesChange={(items) =>
                      setForm((f) => ({ ...f, amenities: items }))
                    }
                    accommodationProvided={form.accommodationProvided}
                    onAccommodationChange={(value) =>
                      set('accommodationProvided', value)
                    }
                  />
                  {err && (
                    <p style={{ fontSize: 14, color: '#dc2626' }}>{err}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Nav buttons ── */}
          <div
            style={{
              flexShrink: 0,
              width: '100%',
              maxWidth: HOST_SETUP_MODAL.contentWidthPx,
              margin: '0 auto',
              paddingTop:
                step === 1
                  ? HOST_SETUP_MODAL.formToActionsGapPx
                  : step === 2
                    ? HOST_SETUP_MODAL.formToActionsGapStep2Px
                    : HOST_SETUP_MODAL.formToActionsGapStep3Px,
            }}
          >
            {step === 1 && (
              <NavButtons onNext={() => setStep(2)} disabled={!step1Valid} nextGradient />
            )}
            {step === 2 && (
              <NavButtons
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                nextGradient
              />
            )}
            {step === 3 && (
              <NavButtons
                onBack={() => setStep(2)}
                onNext={handleFinish}
                nextLabel={busy ? 'Saving…' : 'Done'}
                disabled={busy}
                nextGradient
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = 'Next',
  disabled = false,
  nextGradient = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  disabled?: boolean;
  nextGradient?: boolean;
}) {
  const minH = nextGradient ? 52 : 44;
  const pad = nextGradient ? '10px 12px' : '6px 8px';

  const nextBase: React.CSSProperties = {
    flex: '1 1 0',
    minHeight: minH,
    height: minH,
    padding: pad,
    border: 'none',
    borderRadius: 8,
    fontWeight: 500,
    lineHeight: '140%',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const nextStyle: React.CSSProperties = nextGradient
    ? {
        ...nextBase,
        fontSize: 20,
        background: disabled
          ? '#D1D5DB'
          : 'linear-gradient(270deg, #3A65DB 0%, #0F2A7A 100%)',
        color: disabled ? 'rgba(107, 114, 128, 0.7)' : '#FFFFFF',
      }
    : {
        ...nextBase,
        fontSize: 18,
        background: disabled ? '#D1D5DB' : '#3B4FD8',
        color: disabled ? 'rgba(107, 114, 128, 0.7)' : '#fff',
      };

  const backStyle: React.CSSProperties = {
    flex: '1 1 0',
    minHeight: minH,
    height: minH,
    padding: pad,
    boxSizing: 'border-box',
    background: '#fff',
    color: '#5a6478',
    border: '1px solid #D0D5DD',
    borderRadius: 8,
    fontSize: nextGradient ? 20 : 16,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'stretch' }}>
      {onBack ? (
        <button type="button" onClick={onBack} style={backStyle}>
          Back
        </button>
      ) : null}
      {onNext ? (
        <BarWaveButton
          type="button"
          variant="primary"
          size={nextGradient ? 'lg' : 'md'}
          loadingText={nextLabel === 'Done' ? 'Saving…' : 'Loading…'}
          disabled={disabled}
          onClick={() => Promise.resolve(onNext())}
          style={{
            ...nextStyle,
            flex: '1 1 0',
            width: undefined,
            fontFamily: 'inherit',
          }}
        >
          {nextLabel}
        </BarWaveButton>
      ) : null}
    </div>
  );
}
