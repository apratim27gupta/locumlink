'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  hostApi,
  type GpLocumApplicationFields,
} from '@/lib/api';
import { subscribeProfileUpdated } from '@/lib/profileUpdatedEvent';

/** Keep in sync with backend GP_LOCUM_APPLICATION_PROFILE_KEYS. */
const PROFILE_FIELD_KEYS = [
  'locumName',
  'locumCpsns',
  'locumMsiProviderNumber',
  'locumMailingAddress',
  'locumPracticeAddress',
  'locumPhone',
  'locumFax',
  'locumEmail',
  'hostName',
  'hostMsiProviderNumber',
  'hostPracticeAddress',
  'hostPhone',
  'hostFax',
  'hostEmail',
] as const satisfies ReadonlyArray<keyof GpLocumApplicationFields>;

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const panel: CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  maxWidth: 720,
  width: '100%',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
};

const sectionTitle: CSSProperties = {
  margin: '18px 0 10px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#6B7280',
};

const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
};

const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  fontSize: 13,
  fontFamily: 'inherit',
  color: '#0f1523',
  background: '#fff',
};

const row: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
};

const btnPrimary: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#1C32D2',
  color: '#fff',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondary: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  background: '#fff',
  color: '#0F2A7A',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

type Props = {
  applicationId: string | null;
  open: boolean;
  onClose: () => void;
};

function Field({
  lbl,
  value,
  onChange,
  placeholder,
  full,
}: {
  lbl: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={label}>{lbl}</div>
      <input
        style={input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function GpLocumApplicationModal({ applicationId, open, onClose }: Props) {
  const [fields, setFields] = useState<GpLocumApplicationFields | null>(null);
  const [filename, setFilename] = useState('gp-locum-application.pdf');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!open || !applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDirty(false);
    void (async () => {
      try {
        const res = await hostApi.getGpLocumApplication(applicationId);
        if (cancelled) return;
        setFields(res.fields);
        setFilename(res.filename);
        setSavedAt(res.savedAt);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load form.');
          setFields(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, applicationId]);

  // Live profile → form: refresh profile-sourced fields when host/locum profile is saved.
  useEffect(() => {
    if (!open || !applicationId) return;
    return subscribeProfileUpdated(() => {
      void (async () => {
        try {
          const res = await hostApi.getGpLocumApplication(applicationId);
          setFilename(res.filename);
          setSavedAt(res.savedAt);
          setFields((prev) => {
            if (!prev || !dirtyRef.current) return res.fields;
            const next = { ...prev };
            for (const key of PROFILE_FIELD_KEYS) {
              next[key] = res.fields[key] as never;
            }
            return next;
          });
        } catch {
          // Keep current form if refresh fails.
        }
      })();
    });
  }, [open, applicationId]);

  if (!open || !applicationId) return null;

  const set = <K extends keyof GpLocumApplicationFields>(key: K, value: GpLocumApplicationFields[K]) => {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const onSave = async () => {
    if (!fields) return;
    setSaving(true);
    setError(null);
    try {
      const res = await hostApi.saveGpLocumApplication(applicationId, fields);
      setFields(res.fields);
      setSavedAt(res.savedAt);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save form.');
    } finally {
      setSaving(false);
    }
  };

  const onDownload = async () => {
    if (!fields) return;
    setDownloading(true);
    setError(null);
    try {
      if (dirty) {
        const res = await hostApi.saveGpLocumApplication(applicationId, fields);
        setFields(res.fields);
        setSavedAt(res.savedAt);
        setDirty(false);
      }
      await hostApi.downloadGpLocumApplication(applicationId, fields.locumName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gp-locum-form-title" style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #E5E7EB' }}>
          <h2 id="gp-locum-form-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
            GP Locum Application
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>
            Prefill from this match. Edit remaining fields, save for this application only, then download the PDF.
            {savedAt ? (
              <>
                {' '}
                Last saved {new Date(savedAt).toLocaleString()}.
              </>
            ) : null}
            {dirty ? ' Unsaved changes.' : null}
          </p>
        </div>

        <div style={{ padding: '4px 20px 16px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <p style={{ fontSize: 14, color: '#6B7280', marginTop: 16 }}>Loading…</p>
          ) : !fields ? (
            <p style={{ fontSize: 14, color: '#B91C1C', marginTop: 16 }}>{error || 'Form unavailable.'}</p>
          ) : (
            <>
              {error ? (
                <p style={{ fontSize: 13, color: '#B91C1C', marginTop: 12 }}>{error}</p>
              ) : null}

              <div style={sectionTitle}>Locum physician</div>
              <div style={row}>
                <Field lbl="Physician name" value={fields.locumName} onChange={(v) => set('locumName', v)} />
                <Field lbl="CPSNS Reg #" value={fields.locumCpsns} onChange={(v) => set('locumCpsns', v)} />
                <Field
                  lbl="MSI Provider #"
                  value={fields.locumMsiProviderNumber}
                  onChange={(v) => set('locumMsiProviderNumber', v)}
                />
                <Field lbl="Daytime phone" value={fields.locumPhone} onChange={(v) => set('locumPhone', v)} />
                <Field lbl="Fax" value={fields.locumFax} onChange={(v) => set('locumFax', v)} />
                <Field lbl="Email" value={fields.locumEmail} onChange={(v) => set('locumEmail', v)} />
                <Field
                  lbl="Mailing address"
                  value={fields.locumMailingAddress}
                  onChange={(v) => set('locumMailingAddress', v)}
                  full
                />
                <Field
                  lbl="Practice address"
                  value={fields.locumPracticeAddress}
                  onChange={(v) => set('locumPracticeAddress', v)}
                  full
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={label}>Preferred payment option</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
                  {(
                    [
                      ['', 'Not set'],
                      ['guaranteed_daily', 'Guaranteed Daily Rate'],
                      ['fee_for_service', 'Fee for Service'],
                    ] as const
                  ).map(([val, text]) => (
                    <label key={val || 'unset'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="radio"
                        name="preferredPayment"
                        checked={fields.preferredPayment === val}
                        onChange={() => set('preferredPayment', val)}
                      />
                      {text}
                    </label>
                  ))}
                </div>
              </div>

              <div style={sectionTitle}>Host physician</div>
              <div style={row}>
                <Field lbl="Physician name" value={fields.hostName} onChange={(v) => set('hostName', v)} />
                <Field
                  lbl="MSI Provider #"
                  value={fields.hostMsiProviderNumber}
                  onChange={(v) => set('hostMsiProviderNumber', v)}
                />
                <Field lbl="Daytime phone" value={fields.hostPhone} onChange={(v) => set('hostPhone', v)} />
                <Field lbl="Fax" value={fields.hostFax} onChange={(v) => set('hostFax', v)} />
                <Field lbl="Email" value={fields.hostEmail} onChange={(v) => set('hostEmail', v)} full />
                <Field
                  lbl="Practice address"
                  value={fields.hostPracticeAddress}
                  onChange={(v) => set('hostPracticeAddress', v)}
                  full
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={label}>Primary remuneration</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14, marginBottom: 8 }}>
                  {(
                    [
                      ['', 'Not set'],
                      ['fee_for_service', 'Fee for Service'],
                      ['contract', 'Contract Payment'],
                      ['other', 'Other'],
                    ] as const
                  ).map(([val, text]) => (
                    <label key={val || 'unset'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="radio"
                        name="primaryRemuneration"
                        checked={fields.primaryRemuneration === val}
                        onChange={() => set('primaryRemuneration', val)}
                      />
                      {text}
                    </label>
                  ))}
                </div>
                {fields.primaryRemuneration === 'other' ? (
                  <Field
                    lbl="Other (describe)"
                    value={fields.primaryRemunerationOther}
                    onChange={(v) => set('primaryRemunerationOther', v)}
                    full
                  />
                ) : null}
              </div>

              <div style={sectionTitle}>Locum services</div>
              <div style={row}>
                <Field
                  lbl="Dates (MMM-DD-YYYY)"
                  value={fields.datesWorked}
                  onChange={(v) => set('datesWorked', v)}
                  full
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={label}>Service type</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="serviceType"
                      checked={fields.serviceType === 'office'}
                      onChange={() => set('serviceType', 'office')}
                    />
                    Office Practice
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="serviceType"
                      checked={fields.serviceType === 'nursing_home'}
                      onChange={() => set('serviceType', 'nursing_home')}
                    />
                    Nursing Home
                  </label>
                </div>
              </div>

              <div style={sectionTitle}>Billing information</div>
              <div style={row}>
                <Field
                  lbl="Who will submit claims"
                  value={fields.claimsSubmitter}
                  onChange={(v) => set('claimsSubmitter', v)}
                />
                <Field lbl="Submitter ID" value={fields.submitterId} onChange={(v) => set('submitterId', v)} />
                <Field lbl="Billing email" value={fields.billingEmail} onChange={(v) => set('billingEmail', v)} />
                <Field lbl="Billing phone" value={fields.billingPhone} onChange={(v) => set('billingPhone', v)} />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={label}>Previously provided services for this host/clinic?</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                  {(
                    [
                      ['', 'Not set'],
                      ['no', 'No'],
                      ['yes', 'Yes'],
                    ] as const
                  ).map(([val, text]) => (
                    <label key={val || 'unset'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="radio"
                        name="previouslyProvided"
                        checked={fields.previouslyProvided === val}
                        onChange={() => set('previouslyProvided', val)}
                      />
                      {text}
                    </label>
                  ))}
                </div>
              </div>

              <div style={sectionTitle}>Additional</div>
              <div>
                <div style={label}>Additional information</div>
                <textarea
                  style={{ ...input, minHeight: 80, resize: 'vertical' }}
                  value={fields.additionalInformation}
                  onChange={(e) => set('additionalInformation', e.target.value)}
                />
              </div>
              <div style={{ marginTop: 12, maxWidth: 240 }}>
                <Field
                  lbl="Host signature date"
                  value={fields.hostSignatureDate}
                  onChange={(v) => set('hostSignatureDate', v)}
                  placeholder="Leave blank to sign on paper"
                />
              </div>
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12, lineHeight: 1.45 }}>
                Signatures stay blank on the PDF — sign after download before submitting to MSI.
                Changes apply only to this application’s form ({filename}).
              </p>
            </>
          )}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <button type="button" style={btnSecondary} onClick={onClose} disabled={saving || downloading}>
            Close
          </button>
          <button
            type="button"
            style={{ ...btnSecondary, opacity: !fields || saving ? 0.6 : 1 }}
            disabled={!fields || saving || downloading || loading}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            style={{ ...btnPrimary, opacity: !fields || downloading ? 0.6 : 1 }}
            disabled={!fields || saving || downloading || loading}
            onClick={() => void onDownload()}
          >
            {downloading ? 'Preparing…' : dirty ? 'Save & download' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
