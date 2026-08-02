'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import {
  CUSTOM_PRACTICE_TYPE,
  JOB_AMENITY_OPTIONS,
  KNOWN_PRACTICE_TYPE_VALUES,
  resolvePracticeType,
  splitPracticeType,
} from '@/lib/hostPracticeOptions';
import { sortStringsLocale } from '@/lib/sortLocale';

export type JobPracticeFields = {
  practiceType: string;
  numPhysicians: string;
  emr: string;
  patientVol: string;
  clinicDesc: string;
  amenities: string[];
  accommodationProvided: boolean;
};

type Props = {
  value: JobPracticeFields;
  onChange: (next: JobPracticeFields) => void;
  inputStyle?: CSSProperties;
  labelStyle?: CSSProperties;
};

const defaultLbl: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 6,
};

const defaultInp: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #D0D5DD',
  fontSize: 14,
  fontFamily: 'inherit',
  color: '#111827',
  background: '#fff',
};

export function emptyJobPracticeFields(): JobPracticeFields {
  return {
    practiceType: '',
    numPhysicians: '',
    emr: '',
    patientVol: '',
    clinicDesc: '',
    amenities: [],
    accommodationProvided: false,
  };
}

export function jobPracticeFromProfile(profile: {
  practiceType?: string | null;
  numPhysicians?: string | null;
  emr?: string | null;
  patientVol?: string | null;
  clinicDesc?: string | null;
  amenities?: string[] | null;
  accommodationProvided?: boolean | null;
} | null): JobPracticeFields {
  if (!profile) return emptyJobPracticeFields();
  return {
    practiceType: (profile.practiceType ?? '').trim(),
    numPhysicians: (profile.numPhysicians ?? '').trim(),
    emr: (profile.emr ?? '').trim(),
    patientVol: (profile.patientVol ?? '').trim(),
    clinicDesc: (profile.clinicDesc ?? '').trim().slice(0, 1000),
    amenities: Array.isArray(profile.amenities) ? [...profile.amenities] : [],
    accommodationProvided: Boolean(profile.accommodationProvided),
  };
}

export function HostJobPracticeSections({
  value,
  onChange,
  inputStyle,
  labelStyle,
}: Props) {
  const lbl = labelStyle ?? defaultLbl;
  const inp = inputStyle ?? defaultInp;
  const initialSplit = splitPracticeType(value.practiceType);
  const [practiceChoice, setPracticeChoice] = useState(initialSplit.choice);
  const [practiceCustom, setPracticeCustom] = useState(initialSplit.custom);
  const [customAmenity, setCustomAmenity] = useState('');

  function patch(partial: Partial<JobPracticeFields>) {
    onChange({ ...value, ...partial });
  }

  function onPracticeChoiceChange(choice: string) {
    setPracticeChoice(choice);
    if (choice === CUSTOM_PRACTICE_TYPE) {
      patch({
        practiceType: resolvePracticeType(CUSTOM_PRACTICE_TYPE, practiceCustom),
      });
      return;
    }
    setPracticeCustom('');
    patch({ practiceType: choice });
  }

  function toggleAmenity(name: string) {
    const on = value.amenities.includes(name);
    patch({
      amenities: on
        ? value.amenities.filter((a) => a !== name)
        : [...value.amenities, name],
    });
  }

  function addCustomAmenity() {
    const v = customAmenity.trim();
    if (!v) return;
    if (!value.amenities.includes(v)) {
      patch({ amenities: [...value.amenities, v] });
    }
    setCustomAmenity('');
  }

  const amenityChips = useMemo(() => {
    const all = [...JOB_AMENITY_OPTIONS, ...value.amenities];
    const seen = new Set<string>();
    return sortStringsLocale(
      all.filter((a) => {
        const k = a.trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
    );
  }, [value.amenities]);

  return (
    <>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F', marginBottom: 12 }}>
          Practice Details
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
          className="host-job-practice-grid"
        >
          <div>
            <label style={lbl}>Practice Type</label>
            {practiceChoice === CUSTOM_PRACTICE_TYPE ? (
              <input
                style={inp}
                value={practiceCustom}
                placeholder="Enter practice type"
                onChange={(e) => {
                  setPracticeCustom(e.target.value);
                  patch({
                    practiceType: resolvePracticeType(
                      CUSTOM_PRACTICE_TYPE,
                      e.target.value,
                    ),
                  });
                }}
              />
            ) : (
              <select
                style={inp}
                value={practiceChoice}
                onChange={(e) => onPracticeChoiceChange(e.target.value)}
              >
                <option value="">Select Practice Type</option>
                {KNOWN_PRACTICE_TYPE_VALUES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value={CUSTOM_PRACTICE_TYPE}>Other (custom)</option>
              </select>
            )}
            {practiceChoice === CUSTOM_PRACTICE_TYPE ? (
              <button
                type="button"
                onClick={() => {
                  setPracticeChoice('');
                  setPracticeCustom('');
                  patch({ practiceType: '' });
                }}
                style={{
                  marginTop: 6,
                  border: 'none',
                  background: 'transparent',
                  color: '#1C32D2',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                Back to list
              </button>
            ) : null}
          </div>
          <div>
            <label style={lbl}>No. Of Physicians</label>
            <input
              style={inp}
              value={value.numPhysicians}
              placeholder="No. Of Physicians"
              onChange={(e) => patch({ numPhysicians: e.target.value })}
            />
          </div>
          <div>
            <label style={lbl}>EMR System</label>
            <input
              style={inp}
              value={value.emr}
              placeholder="EMR System"
              onChange={(e) => patch({ emr: e.target.value })}
            />
          </div>
          <div>
            <label style={lbl}>Patient Volume Per Day</label>
            <input
              style={inp}
              value={value.patientVol}
              placeholder="No. Of Patients Per Day"
              onChange={(e) => patch({ patientVol: e.target.value })}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Clinic Description (Maximum 1000 Characters)</label>
          <textarea
            style={{ ...inp, minHeight: 90, resize: 'vertical' }}
            value={value.clinicDesc}
            maxLength={1000}
            placeholder="Clinic Description"
            onChange={(e) =>
              patch({ clinicDesc: e.target.value.slice(0, 1000) })
            }
          />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F', marginBottom: 12 }}>
          Services Offered
        </div>
        <label style={{ ...lbl, marginBottom: 10 }}>Amenities</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {amenityChips.map((name) => {
            const on = value.amenities.includes(name);
            return (
              <span
                key={name}
                onClick={() => toggleAmenity(name)}
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
                {name}
                {on ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAmenity(name);
                    }}
                    style={{ fontSize: 14, color: '#1C32D2', lineHeight: 1 }}
                  >
                    ×
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <input
            type="text"
            value={customAmenity}
            onChange={(e) => setCustomAmenity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              addCustomAmenity();
            }}
            placeholder="Add Custom Amenity And Press Enter"
            style={{ ...inp, flex: 1 }}
          />
          <button
            type="button"
            onClick={addCustomAmenity}
            disabled={!customAmenity.trim()}
            style={{
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #D0D5DD',
              background: customAmenity.trim() ? '#fff' : '#F3F4F6',
              color: customAmenity.trim() ? '#111827' : '#9CA3AF',
              fontSize: 13,
              fontWeight: 600,
              cursor: customAmenity.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            Add
          </button>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            color: '#374151',
            cursor: 'pointer',
            marginTop: 14,
          }}
        >
          <input
            type="checkbox"
            checked={value.accommodationProvided}
            onChange={(e) =>
              patch({ accommodationProvided: e.target.checked })
            }
            style={{ width: 16, height: 16, accentColor: '#1C32D2' }}
          />
          Accommodation Provided For Locum
        </label>
      </div>
    </>
  );
}
