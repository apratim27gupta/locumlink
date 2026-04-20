'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HomeLandingView } from '@/components/HomeLandingView';
import { useAuth } from '@/providers/AuthProvider';
import { locumApi, uploadFile } from '@/lib/api';
import type { LocumProfile } from '@/types';

const LOCUM_SETUP_MODAL = {
  widthPx: 476,
  heightPx: 790,
  maxHeight: 'calc(100vh - 40px)',
  paddingPx: 32,
  borderRadiusPx: 6,
  contentWidthPx: 412,
  headerHeightPx: 100,
  headerHeightStep3Px: 100,
  formToActionsGapStep1Px: 28,
  formToActionsGapStep2Px: 28,
  formToActionsGapStep3Px: 167,
  bodyTopGapPx: 24,
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)',
} as const;

// ── FIX Issue 4 (locum): preset specialization options ───────────────────────
const SPECIALIZATION_OPTIONS = [
  'Family Medicine',
  'Internal Medicine',
  'Emergency Medicine',
  'General Practice',
  'Anaesthetics',
  'Paediatrics',
  'ENT',
  'Obstetrics & Gynaecology',
  'Psychiatry',
  'Surgery',
] as const;

function parseSpecializations(s: string): string[] {
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
  zIndex: 10,
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
    specialization: '', // stored as comma-separated string
    address1: '',
    address2: '',
    postalCode: '',
    city: '',
    // ── FIX Issue 3: default to Nova Scotia ──────────────────────────────────
    province: 'Nova Scotia',
    licenseFileName: '',
    resumeFileName: '',
    extraFileName: '',
  });

  // ── FIX Issue 4 (locum): tag state derived from form.specialization ────────
  const [specializationTags, setSpecializationTags] = useState<string[]>([]);
  const [addingCustomSpec, setAddingCustomSpec] = useState(false);
  const [customSpec, setCustomSpec] = useState('');
  const customSpecRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState<string | null>(null);

  const licenseRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);

  function updateSpecializationTags(tags: string[]) {
    setSpecializationTags(tags);
    setForm((f) => ({ ...f, specialization: tags.join(', ') }));
  }

  function confirmCustomSpec() {
    const t = customSpec.trim();
    if (t && !specializationTags.includes(t)) {
      updateSpecializationTags([...specializationTags, t]);
    }
    setCustomSpec('');
    setAddingCustomSpec(false);
  }

  const step1Valid = useMemo(
    () =>
      (form.firstName ?? '').trim().length > 0 &&
      (form.lastName ?? '').trim().length > 0 &&
      (form.cpsnsNumber ?? '').trim().length > 0 &&
      (form.professionalSummary ?? '').trim().length > 0 &&
      specializationTags.length > 0, // must have at least one tag
    [form, specializationTags],
  );

  const step2Valid = useMemo(
    () =>
      (form.address1 ?? '').trim().length > 0 &&
      (form.postalCode ?? '').trim().length > 0 &&
      (form.city ?? '').trim().length > 0 &&
      (form.province ?? '').trim().length > 0,
    [form.address1, form.postalCode, form.city, form.province],
  );

  const step3Valid = useMemo(
    () =>
      (form.licenseFileName ?? '').trim().length > 0 &&
      (form.resumeFileName ?? '').trim().length > 0,
    [form.licenseFileName, form.resumeFileName],
  );

  function set<K extends keyof LocumProfile>(k: K, v: LocumProfile[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleFinish() {
    setBusy(true);
    setErr('');
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
    router.replace('/locum/dashboard');
    setBusy(false);
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

      {/* Profile card */}
      <div style={locumModalCardBase}>
        {/* Header */}
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
            onClick={() => router.push('/home')}
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

        {/* Body */}
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
              {/* ── Step 1: Basic Information ── */}
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
                    {/* Name row */}
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
                        <label style={lbl}>First name</label>
                        <input
                          className="locum-setup-input"
                          style={inp}
                          placeholder="John"
                          value={form.firstName}
                          onChange={(e) => set('firstName', e.target.value)}
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
                          placeholder="Doe"
                          value={form.lastName}
                          onChange={(e) => set('lastName', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* CPSNS */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <label style={lbl}>CPSNS Number</label>
                      <input
                        className="locum-setup-input"
                        style={inp}
                        placeholder="Enter CPSNS Number"
                        value={form.cpsnsNumber}
                        onChange={(e) => set('cpsnsNumber', e.target.value)}
                      />
                    </div>

                    {/* Professional Summary */}
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

                    {/* ── FIX Issue 4 (locum): multi-tag specialization ──────────────── */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <label style={lbl}>Specialization</label>

                      {/* Row: preset dropdown + Custom button */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <select
                            style={{
                              ...inp,
                              width: '100%',
                              paddingRight: 36,
                              color: '#0B0F1F',
                            }}
                            value=""
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v && !specializationTags.includes(v)) {
                                updateSpecializationTags([
                                  ...specializationTags,
                                  v,
                                ]);
                              }
                              e.target.selectedIndex = 0;
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

                        {!addingCustomSpec && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingCustomSpec(true);
                              setTimeout(
                                () => customSpecRef.current?.focus(),
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

                      {/* Inline custom text input */}
                      {addingCustomSpec && (
                        <div
                          style={{ display: 'flex', gap: 8, marginBottom: 8 }}
                        >
                          <input
                            ref={customSpecRef}
                            type="text"
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
                            onClick={confirmCustomSpec}
                            style={{
                              padding: '0 14px',
                              height: 38,
                              background: '#1B31D2',
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
                              setCustomSpec('');
                              setAddingCustomSpec(false);
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

                      {/* Tag pills */}
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

              {/* ── Step 2: Location ── */}
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
                            className="locum-setup-input"
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
                            className="locum-setup-input"
                            style={inpStep2}
                            placeholder="Location Address Line 2"
                            value={form.address2}
                            onChange={(e) => set('address2', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Postal + City + Province */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 16,
                          width: '100%',
                        }}
                      >
                        {/* ── FIX Issue 3 (locum): NS postal placeholder ── */}
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
                            placeholder="B0A 1A0 (Nova Scotia)"
                            value={form.postalCode}
                            onChange={(e) =>
                              set('postalCode', e.target.value.toUpperCase())
                            }
                          />
                        </div>
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
                              maxWidth: 200,
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            <label style={lbl}>City</label>
                            <input
                              className="locum-setup-input"
                              style={inpStep2}
                              placeholder="Add city"
                              value={form.city}
                              onChange={(e) => set('city', e.target.value)}
                            />
                          </div>
                          <div
                            style={{
                              flex: 1,
                              maxWidth: 200,
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            {/* ── FIX Issue 3: Province pre-filled as Nova Scotia ── */}
                            <label style={lbl}>Province</label>
                            <input
                              className="locum-setup-input"
                              style={{
                                ...inpStep2,
                                background: '#F9FAFB',
                                color: '#374151',
                              }}
                              value={form.province}
                              onChange={(e) => set('province', e.target.value)}
                              placeholder="Nova Scotia"
                            />
                            <span
                              style={{
                                fontSize: 11,
                                color: '#9CA3AF',
                                marginTop: -4,
                              }}
                            >
                              Defaults to Nova Scotia
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 3: Upload Documents ── */}
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
                    {/* CPSNS License */}
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
                            : form.licenseFileName
                              ? form.licenseFileName.split('/').pop()
                              : 'Upload Document'}
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
                            set('licenseFileName', result.path);
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
                            : form.resumeFileName
                              ? form.resumeFileName.split('/').pop()
                              : 'Upload Document'}
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
                            set('resumeFileName', result.path);
                          } catch {
                            alert('Upload failed. Try again.');
                          } finally {
                            setUploading(null);
                            e.target.value = '';
                          }
                        }}
                      />
                    </div>

                    {/* Additional Documents */}
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
                        Additional Documents (Optional)
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
                            : form.extraFileName
                              ? form.extraFileName.split('/').pop()
                              : 'Upload Document'}
                        </span>
                        <UploadCloudIcon />
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
                            const result = await uploadFile(
                              file,
                              'locum/extra',
                            );
                            set('extraFileName', result.path);
                          } catch {
                            alert('Upload failed. Try again.');
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

          {/* Footer nav buttons */}
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
              <NavButtons onNext={() => setStep(2)} disabled={!step1Valid} />
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
  const nextBase: React.CSSProperties = {
    flex: 2,
    minHeight: nextGradient ? 48 : 44,
    padding: nextGradient ? '10px 12px' : '6px 8px',
    border: 'none',
    borderRadius: 8,
    fontWeight: 500,
    lineHeight: '140%',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };

  const nextStyle: React.CSSProperties = nextGradient
    ? {
        ...nextBase,
        fontSize: 20,
        background: disabled
          ? '#D1D5DB'
          : 'linear-gradient(270deg, #3A65DB 0%, #1B31D2 100%)',
        color: disabled ? 'rgba(107, 114, 128, 0.7)' : '#FFFFFF',
      }
    : {
        ...nextBase,
        fontSize: 18,
        background: disabled ? '#D1D5DB' : '#3B4FD8',
        color: disabled ? 'rgba(107, 114, 128, 0.7)' : '#fff',
      };

  return (
    <div style={{ display: 'flex', gap: 12, width: '100%' }}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '6px 8px',
            background: '#fff',
            color: '#5a6478',
            border: '1px solid #D0D5DD',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Back
        </button>
      ) : null}
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          disabled={disabled}
          style={nextStyle}
        >
          {nextLabel}
        </button>
      ) : null}
    </div>
  );
}
