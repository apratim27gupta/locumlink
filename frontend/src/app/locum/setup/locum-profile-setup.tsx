'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import citiesRaw from '@/data/cities.json';
import { useRouter } from 'next/navigation';
import { HomeLandingView } from '@/components/HomeLandingView';
import { useAuth } from '@/providers/AuthProvider';
import { locumApi, uploadFile } from '@/lib/api';
import {
  formatUploadedFileLabel,
  originalUploadFileName,
} from '@/lib/uploadDisplayName';
import type { LocumProfile } from '@/types';
import { sanitizeCpsnsInput } from '@/lib/cpsnsVerify';
import BarWaveButton from '@/components/ui/BarWaveButton';
import { dispatchProfileUpdated } from '@/lib/profileUpdatedEvent';
import { beforeClientNavigation } from '@/lib/topLoader';
import { useAnchoredDropdownMenu } from '@/hooks/useAnchoredDropdownMenu';
import { AnchoredDropdownPortal } from '@/components/ui/AnchoredDropdownMenu';
import { sortStringsLocale } from '@/lib/sortLocale';
const LOCUM_SETUP_MODAL = {
  widthPx: 476,
  heightPx: 790,
  maxHeight: 'calc(100dvh - 40px)',
  paddingPx: 32,
  borderRadiusPx: 6,
  contentWidthPx: 412,
  headerHeightPx: 100,
  headerHeightStep3Px: 100,
  formToActionsGapStep1Px: 28,
  formToActionsGapStep2Px: 28,
  formToActionsGapStep3Px: 20,
  bodyTopGapPx: 24,
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)',
} as const;
const SPECIALIZATION_OPTIONS = sortStringsLocale([
  'Family Medicine',
  'Internal Medicine',
  'Emergency Medicine',
  'Anesthesiology',
  'Paediatrics',
  'ENT',
  'Obstetrics & Gynaecology',
  'Psychiatry',
  'Surgery',
]);
function parseSpecializations(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
type CityEntry = {
  name: string;
  province: string;
};
const CITY_ROWS: CityEntry[] = (citiesRaw as [string, string][]).map(
  ([name, province]) => ({ name, province }),
);
const PROVINCE_NAMES: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland & Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};
const markHighlight: React.CSSProperties = {
  background: 'rgba(15,42,122,0.12)',
  color: '#0F2A7A',
  borderRadius: 3,
  padding: '0 2px',
  fontWeight: 700,
};
function highlightCityMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const idx = lower.indexOf(lq);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={markHighlight}>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
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
const selectSpecInp: React.CSSProperties = {
  ...inp,
  width: '100%',
  paddingRight: 36,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
};
const inpStep2: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #D0D5DD',
  borderRadius: 4,
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
function ReqStar() {
  return (
    <span
      style={{
        color: '#0B0F1F',
        fontWeight: 600,
        display: 'inline',
        marginLeft: 4,
        lineHeight: 'inherit',
      }}
      aria-hidden
    >
      *
    </span>
  );
}
const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 500,
  lineHeight: '140%',
  color: '#0B0F1F',
};
const uploadRowShell: React.CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 56,
  height: 56,
  padding: '6px 8px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 29,
  background: 'rgba(58, 101, 219, 0.1)',
  border: '1px dashed rgba(21, 20, 20, 0.4)',
  borderRadius: 8,
  cursor: 'pointer',
};
const uploadRowLabel: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 400,
  lineHeight: '140%',
  color: '#3A65DB',
  fontFamily: 'inherit',
};
const locumModalCardBase: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  boxSizing: 'border-box',
  width: LOCUM_SETUP_MODAL.widthPx,
  height: LOCUM_SETUP_MODAL.heightPx,
  maxHeight: LOCUM_SETUP_MODAL.maxHeight,
  background: '#FFFFFF',
  borderRadius: LOCUM_SETUP_MODAL.borderRadiusPx,
  padding: LOCUM_SETUP_MODAL.paddingPx,
  boxShadow: LOCUM_SETUP_MODAL.boxShadow,
  zIndex: 100,
  isolation: 'isolate',
  pointerEvents: 'auto',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Inter', var(--font-family-body, DM Sans, sans-serif)",
};
export default function LocumSetupPage() {
  const router = useRouter();
  const { completeProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<LocumProfile>({
    firstName: '',
    lastName: '',
    cpsnsNumber: '',
    professionalSummary: '',
    specialization: '',
    address1: '',
    address2: '',
    postalCode: '',
    city: '',
    province: '',
    licenseFileName: '',
    licenseOriginalName: '',
    resumeFileName: '',
    resumeOriginalName: '',
    extraFileName: '',
    extraOriginalName: '',
  });
  const [specializationTags, setSpecializationTags] = useState<string[]>([]);
  const [addingCustomSpec, setAddingCustomSpec] = useState(false);
  const [customSpec, setCustomSpec] = useState('');
  const customSpecRef = useRef<HTMLInputElement>(null);
  const customSpecRowRef = useRef<HTMLDivElement>(null);
  const [specSelectKey, setSpecSelectKey] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const licenseRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const [cityResults, setCityResults] = useState<CityEntry[]>([]);
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
  const searchCities = useCallback((q: string) => {
    if (!q || q.trim().length < 2) {
      setCityResults([]);
      setCityDropOpen(false);
      return;
    }
    const lower = q.trim().toLowerCase();
    let found = CITY_ROWS.filter((c) =>
      c.name.toLowerCase().startsWith(lower),
    ).slice(0, 8);
    if (found.length < 4) {
      const keys = new Set(found.map((c) => `${c.name}|${c.province}`));
      const extra = CITY_ROWS.filter(
        (c) =>
          !keys.has(`${c.name}|${c.province}`) &&
          c.name.toLowerCase().includes(lower),
      ).slice(0, 8 - found.length);
      found = [...found, ...extra];
    }
    setCityResults(found);
    setCityActiveIdx(-1);
    setCityDropOpen(true);
  }, []);
  function updateSpecializationTags(tags: string[]) {
    setSpecializationTags(tags);
    setForm((f) => ({ ...f, specialization: tags.join(', ') }));
  }
  function appendSpecializationTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setSpecializationTags((prev) => {
      if (prev.includes(t)) return prev;
      const next = [...prev, t];
      setForm((f) => ({ ...f, specialization: next.join(', ') }));
      return next;
    });
    setSpecSelectKey((k) => k + 1);
  }
  function confirmCustomSpec() {
    const t = customSpec.trim();
    setCustomSpec('');
    setAddingCustomSpec(false);
    appendSpecializationTag(t);
  }
  function openCustomSpecRow() {
    setAddingCustomSpec(true);
    setCustomSpec('');
    requestAnimationFrame(() => {
      customSpecRef.current?.focus();
      customSpecRowRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
  }
  const step1Valid = useMemo(
    () => (form.firstName ?? '').trim().length > 0,
    [form.firstName],
  );
  const step2Valid = true;
  const step3Valid = true;
  function set<K extends keyof LocumProfile>(k: K, v: LocumProfile[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function handleCitySelect(city: CityEntry) {
    set('city', city.name);
    set('province', city.province);
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
  // Auto-save form to localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('locum_setup_form');
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm((f) => ({ ...f, ...parsed }));
        if (parsed.specialization) {
          setSpecializationTags(
            parsed.specialization
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean),
          );
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('locum_setup_form', JSON.stringify(form));
    } catch {}
  }, [form]);
  async function handleFinish() {
    setBusy(true);
    setErr('');
    try {
      localStorage.removeItem('locum_setup_form');
    } catch {}
    try {
      await locumApi.saveProfile(form);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Could not save your profile. Try again.';
      setErr(msg);
      setBusy(false);
      return;
    }
    completeProfile();
    dispatchProfileUpdated();
    beforeClientNavigation('/locum/dashboard');
    router.replace('/locum/dashboard');
    setBusy(false);
  }
  return (
    <div
      className="setup-page-shell"
      style={{
        height: '100dvh',
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
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(47, 71, 160, 0.45)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      <div className="setup-modal" style={locumModalCardBase}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            minHeight:
              step === 3
                ? LOCUM_SETUP_MODAL.headerHeightStep3Px
                : LOCUM_SETUP_MODAL.headerHeightPx,
            marginBottom: LOCUM_SETUP_MODAL.bodyTopGapPx,
          }}
        >
          <button
            type="button"
            onClick={() => {
              beforeClientNavigation('/auth');
              router.push('/auth');
            }}
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
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 300, color: '#000' }}>
              ×
            </span>
          </button>
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
                maxWidth: LOCUM_SETUP_MODAL.contentWidthPx,
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
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
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 24,
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
                        }}
                      >
                        <label htmlFor="locum-setup-firstname" style={lbl}>
                          First name
                          <ReqStar />
                        </label>
                        <input
                          id="locum-setup-firstname"
                          className="locum-setup-input"
                          style={inp}
                          placeholder="First name"
                          value={form.firstName}
                          onChange={(e) => set('firstName', e.target.value)}
                          aria-required
                        />
                      </div>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <label style={lbl}>Last name</label>
                        <input
                          className="locum-setup-input"
                          style={inp}
                          placeholder="Last name"
                          value={form.lastName}
                          onChange={(e) => set('lastName', e.target.value)}
                        />
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
                      <label htmlFor="locum-setup-cpsns" style={lbl}>
                        CPSNS Number
                      </label>
                      <input
                        id="locum-setup-cpsns"
                        className="locum-setup-input"
                        style={inp}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="License number"
                        value={form.cpsnsNumber}
                        onChange={(e) =>
                          set('cpsnsNumber', sanitizeCpsnsInput(e.target.value))
                        }
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        width: '100%',
                      }}
                    >
                      <label style={lbl}>Professional Summary</label>
                      <textarea
                        className="locum-setup-input"
                        style={{
                          ...inp,
                          minHeight: 78,
                          height: 78,
                          resize: 'vertical',
                        }}
                        placeholder="Add Summary"
                        value={form.professionalSummary}
                        onChange={(e) =>
                          set('professionalSummary', e.target.value)
                        }
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
                      <label style={lbl}>Specialization</label>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          width: '100%',
                        }}
                      >
                        {!addingCustomSpec ? (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'stretch',
                              gap: 8,
                              width: '100%',
                            }}
                          >
                            <div
                              style={{
                                position: 'relative',
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <select
                                key={specSelectKey}
                                aria-label="Pick specialization to add"
                                style={{
                                  ...selectSpecInp,
                                  color: '#0B0F1F',
                                }}
                                value=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  appendSpecializationTag(v);
                                }}
                              >
                                <option value="">Pick Specialization</option>
                                {SPECIALIZATION_OPTIONS.filter(
                                  (o) => !specializationTags.includes(o),
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
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openCustomSpecRow();
                              }}
                              style={{
                                flexShrink: 0,
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
                                boxSizing: 'border-box',
                              }}
                            >
                              + Custom
                            </button>
                          </div>
                        ) : null}

                        {addingCustomSpec ? (
                          <div
                            ref={customSpecRowRef}
                            style={{
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'stretch',
                              flexWrap: 'wrap',
                              gap: 8,
                              width: '100%',
                            }}
                          >
                            <input
                              ref={customSpecRef}
                              type="text"
                              aria-label="Custom specialization"
                              value={customSpec}
                              onChange={(e) => setCustomSpec(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  confirmCustomSpec();
                                }
                                if (e.key === 'Escape') {
                                  setCustomSpec('');
                                  setAddingCustomSpec(false);
                                }
                              }}
                              placeholder="Type specialization…"
                              style={{
                                flex: '1 1 160px',
                                minWidth: 0,
                                height: 44,
                                padding: '6px 8px',
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
                              onClick={(e) => {
                                e.preventDefault();
                                confirmCustomSpec();
                              }}
                              style={{
                                padding: '0 14px',
                                height: 44,
                                background: '#0F2A7A',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box',
                              }}
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setCustomSpec('');
                                setAddingCustomSpec(false);
                              }}
                              style={{
                                padding: '0 10px',
                                height: 44,
                                background: 'none',
                                color: '#6B7280',
                                border: '1px solid #D0D5DD',
                                borderRadius: 8,
                                fontSize: 13,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setCustomSpec('');
                                setAddingCustomSpec(false);
                                setSpecSelectKey((k) => k + 1);
                              }}
                              style={{
                                padding: '0 10px',
                                height: 44,
                                background: '#fff',
                                color: '#3B4FD8',
                                border: '1px solid #3B4FD8',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box',
                              }}
                            >
                              List
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {specializationTags.length > 0 && (
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
                        >
                          {specializationTags.map((tag) => (
                            <span
                              key={tag}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 12px',
                                borderRadius: 40,
                                background: 'rgba(115, 177, 251, 0.1)',
                                color: '#1522A6',
                                fontSize: 14,
                                lineHeight: '100%',
                                letterSpacing: '0.02em',
                              }}
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() =>
                                  updateSpecializationTags(
                                    specializationTags.filter((t) => t !== tag),
                                  )
                                }
                                aria-label={`Remove ${tag}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 16,
                                  height: 16,
                                  padding: 0,
                                  border: '1.5px solid #1522A6',
                                  borderRadius: 50,
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
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
                      )}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
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
                      gap: 16,
                      width: '100%',
                    }}
                  >
                    <div style={sectionTitle}>Location</div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 24,
                        width: '100%',
                      }}
                    >
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
                            className="locum-setup-input"
                            style={inpStep2}
                            placeholder="Address Line 1"
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
                            className="locum-setup-input"
                            style={inpStep2}
                            placeholder="Address Line 2"
                            value={form.address2}
                            onChange={(e) => set('address2', e.target.value)}
                          />
                        </div>
                      </div>

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
                            ref={cityAnchorRef}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                              position: 'relative',
                            }}
                          >
                            <label htmlFor="locum-setup-city" style={lbl}>
                              City
                            </label>
                            <input
                              id="locum-setup-city"
                              ref={cityInputRef}
                              className="locum-setup-input"
                              style={{
                                ...inp,
                                borderColor:
                                  form.city && form.province
                                    ? '#22C55E'
                                    : undefined,
                                boxShadow:
                                  form.city && form.province
                                    ? '0 0 0 3px rgba(34,197,94,0.1)'
                                    : undefined,
                              }}
                              placeholder="City"
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
                                if (cityResults.length) setCityDropOpen(true);
                              }}
                              onBlur={() => {
                                cityBlurTimer.current = setTimeout(
                                  () => setCityDropOpen(false),
                                  160,
                                );
                              }}
                            />
                            <AnchoredDropdownPortal
                              open={cityDropOpen}
                              menuBox={cityMenuBox}
                              menuRef={cityMenuRef}
                            >
                              {cityResults.length === 0 ? (
                                <div
                                  style={{
                                    padding: '14px',
                                    fontSize: 13,
                                    color: 'rgba(11,15,31,0.4)',
                                    textAlign: 'center',
                                  }}
                                >
                                  No city found
                                </div>
                              ) : (
                                cityResults.map((city, i) => (
                                  <div
                                    key={`${city.name}-${city.province}`}
                                    role="option"
                                    aria-selected={i === cityActiveIdx}
                                    onMouseDown={() => handleCitySelect(city)}
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
                                      transition: 'background 0.12s',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: '#0B0F1F',
                                      }}
                                    >
                                      {highlightCityMatch(
                                        city.name,
                                        form.city ?? '',
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
                                      }}
                                    >
                                      {city.province}
                                    </span>
                                  </div>
                                ))
                              )}
                            </AnchoredDropdownPortal>
                          </div>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            <label htmlFor="locum-setup-province" style={lbl}>
                              Province
                            </label>
                            {form.province ? (
                              <div
                                style={{
                                  ...inp,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  borderColor: '#22C55E',
                                  background: '#F8FFF9',
                                  pointerEvents: 'none',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: '0.04em',
                                    background: 'rgba(15,42,122,0.1)',
                                    color: '#0F2A7A',
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    flexShrink: 0,
                                  }}
                                >
                                  {form.province}
                                </span>
                                <span
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: '#0B0F1F',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {PROVINCE_NAMES[form.province] ??
                                    form.province}
                                </span>
                              </div>
                            ) : (
                              <input
                                id="locum-setup-province"
                                className="locum-setup-input"
                                style={{
                                  ...inp,
                                  color: 'rgba(11,15,31,0.3)',
                                  background: '#F8FAFF',
                                }}
                                placeholder="Province"
                                value=""
                                readOnly
                                tabIndex={-1}
                                aria-readonly
                              />
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
                            className="locum-setup-input"
                            style={inpStep2}
                            placeholder="Postal Code"
                            value={form.postalCode}
                            onChange={(e) =>
                              set('postalCode', e.target.value.toUpperCase())
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    width: '100%',
                  }}
                >
                  <div style={sectionTitle}>Upload Documents</div>
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
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <label style={{ ...lbl, marginBottom: 0 }}>
                        CPSNS License
                      </label>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => licenseRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ')
                            licenseRef.current?.click();
                        }}
                        style={uploadRowShell}
                      >
                        <span
                          style={{
                            ...uploadRowLabel,
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {uploading === 'license'
                            ? 'Uploading…'
                            : formatUploadedFileLabel(
                                form.licenseFileName,
                                form.licenseOriginalName,
                                'Upload document',
                              )}
                        </span>
                        <UploadCloudIcon />
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
                            const result = await uploadFile(
                              file,
                              'locum/license',
                            );
                            setForm((f) => ({
                              ...f,
                              licenseFileName: result.path,
                              licenseOriginalName: originalUploadFileName(
                                result,
                                file,
                              ),
                            }));
                          } catch (err) {
                            alert(
                              err instanceof Error
                                ? err.message
                                : 'Upload failed. Try again.',
                            );
                          } finally {
                            setUploading(null);
                            e.target.value = '';
                          }
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <label style={{ ...lbl, marginBottom: 0 }}>Resume</label>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => resumeRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ')
                            resumeRef.current?.click();
                        }}
                        style={uploadRowShell}
                      >
                        <span
                          style={{
                            ...uploadRowLabel,
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {uploading === 'resume'
                            ? 'Uploading…'
                            : formatUploadedFileLabel(
                                form.resumeFileName,
                                form.resumeOriginalName,
                                'Upload document',
                              )}
                        </span>
                        <UploadCloudIcon />
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
                            const result = await uploadFile(
                              file,
                              'locum/resume',
                            );
                            setForm((f) => ({
                              ...f,
                              resumeFileName: result.path,
                              resumeOriginalName: originalUploadFileName(
                                result,
                                file,
                              ),
                            }));
                          } catch (err) {
                            alert(
                              err instanceof Error
                                ? err.message
                                : 'Upload failed. Try again.',
                            );
                          } finally {
                            setUploading(null);
                            e.target.value = '';
                          }
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <label style={{ ...lbl, marginBottom: 0 }}>
                        Additional Documents
                      </label>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => extraRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ')
                            extraRef.current?.click();
                        }}
                        style={uploadRowShell}
                      >
                        <span
                          style={{
                            ...uploadRowLabel,
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {uploading === 'extra'
                            ? 'Uploading…'
                            : formatUploadedFileLabel(
                                form.extraFileName,
                                form.extraOriginalName,
                                'Upload document',
                              )}
                        </span>
                        <UploadCloudIcon />
                      </div>
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
                            const result = await uploadFile(
                              file,
                              'locum/extra',
                            );
                            setForm((f) => ({
                              ...f,
                              extraFileName: result.path,
                              extraOriginalName: originalUploadFileName(
                                result,
                                file,
                              ),
                            }));
                          } catch (err) {
                            alert(
                              err instanceof Error
                                ? err.message
                                : 'Upload failed. Try again.',
                            );
                          } finally {
                            setUploading(null);
                            e.target.value = '';
                          }
                        }}
                      />
                      <p
                        style={{
                          margin: 0,
                          fontSize: 16,
                          lineHeight: '140%',
                          fontWeight: 400,
                          fontStyle: 'italic',
                          color: '#636364',
                        }}
                      >
                        -Cover letter, reference letters, etc
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          lineHeight: '140%',
                          fontWeight: 400,
                          color: '#9CA3AF',
                        }}
                      >
                        Accepted formats: PDF, DOC, DOCX, PNG
                      </p>
                    </div>
                  </div>
                  {err ? (
                    <p style={{ fontSize: 14, color: '#dc2626', margin: 0 }}>
                      {err}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              width: '100%',
              maxWidth: LOCUM_SETUP_MODAL.contentWidthPx,
              margin: '0 auto',
              paddingTop:
                step === 1
                  ? LOCUM_SETUP_MODAL.formToActionsGapStep1Px
                  : step === 2
                    ? LOCUM_SETUP_MODAL.formToActionsGapStep2Px
                    : LOCUM_SETUP_MODAL.formToActionsGapStep3Px,
            }}
          >
            {step === 1 && (
              <NavButtons
                onNext={() => setStep(2)}
                disabled={!step1Valid}
                nextGradient
              />
            )}
            {step === 2 && (
              <NavButtons
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                disabled={!step2Valid}
                nextGradient
              />
            )}
            {step === 3 && (
              <NavButtons
                onBack={() => setStep(2)}
                onNext={handleFinish}
                nextLabel={busy ? 'Saving…' : 'Done'}
                disabled={busy || !step3Valid}
                nextGradient
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function UploadCloudIcon() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        stroke="#3A65DB"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.33-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
      />
    </svg>
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
    <div
      style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'stretch' }}
    >
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
          onClick={() => Promise.resolve(onNext?.())}
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
