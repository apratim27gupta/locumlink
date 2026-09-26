'use client';

import type React from 'react';
import {
  addClockHours,
  HALF_SLOT_HOURS,
  FULL_SLOT_HOURS,
  halfSlotsOverlap,
  slotEndInvalid,
} from '@/lib/jobSchedule';
import { hostJobFieldInp, hostJobFieldLbl } from '@/lib/hostJobPostingForm';

export type SlotKindOrEmpty = 'HALF' | 'FULL' | '';

const halfSlotCardStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: '1px solid rgba(48, 155, 183, 0.35)',
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const halfSlotAddBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px dashed #309BB7',
  background: '#fff',
  color: '#1B6F86',
  fontWeight: 600,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const halfSlotRemoveBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  border: 'none',
  background: 'transparent',
  color: '#1B6F86',
  cursor: 'pointer',
  fontSize: 17,
  lineHeight: 1,
  padding: '0 2px',
};

function EndTimeField({
  start,
  defaultEnd,
  override,
  onChange,
  fieldInp,
  lbl,
}: {
  start: string;
  defaultEnd: string | null;
  override: string | null | undefined;
  onChange: (value: string | null) => void;
  fieldInp: React.CSSProperties;
  lbl: React.CSSProperties;
}) {
  const custom = Boolean(override?.trim());
  const invalid = slotEndInvalid(start, override);
  return (
    <div style={{ marginTop: 8 }}>
      <label style={lbl}>End time</label>
      <input
        type="time"
        style={fieldInp}
        value={custom ? override ?? '' : defaultEnd ?? ''}
        disabled={!start.trim()}
        onChange={(e) => {
          const v = e.target.value;
          onChange(!v || v === defaultEnd ? null : v);
        }}
      />
      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
        {custom ? (
          <>
            Default {defaultEnd ?? '-'} ·{' '}
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                color: '#1B6F86',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Reset
            </button>
          </>
        ) : (
          'Defaults from start time; change if your clinic hours differ.'
        )}
      </div>
      {invalid ? (
        <div style={{ fontSize: 12, color: '#B42318', marginTop: 4, fontWeight: 600 }}>
          End time must be after start time.
        </div>
      ) : null}
    </div>
  );
}

/**
 * One day of work: Full (7h) or Half (1–2 × 3.5h). Reused for continuous,
 * each range, and specific-date (shared or per-day) configs.
 * End times default to start + slot hours; pass the `on*EndChange` props to let
 * the host override them (billing still uses the nominal slot hours).
 */
export function DayConfigEditor({
  slotKind,
  startTime,
  secondHalfStart,
  endOverride,
  secondHalfEndOverride,
  onSlotKindChange,
  onStartChange,
  onSecondChange,
  onEndChange,
  onSecondEndChange,
  onAddSecond,
  onRemoveSecond,
  heading = 'What does each work day look like?',
  inputStyle,
  labelStyle,
}: {
  slotKind: SlotKindOrEmpty;
  startTime: string;
  secondHalfStart: string | null;
  endOverride?: string | null;
  secondHalfEndOverride?: string | null;
  onSlotKindChange: (kind: SlotKindOrEmpty) => void;
  onStartChange: (value: string) => void;
  onSecondChange: (value: string) => void;
  onEndChange?: (value: string | null) => void;
  onSecondEndChange?: (value: string | null) => void;
  onAddSecond: () => void;
  onRemoveSecond: () => void;
  heading?: string;
  inputStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}) {
  const fieldInp = inputStyle ?? hostJobFieldInp;
  const lbl = labelStyle ?? hostJobFieldLbl;
  const fullEnd =
    slotKind === 'FULL' && startTime.trim()
      ? addClockHours(startTime, FULL_SLOT_HOURS)
      : null;
  const firstEnd =
    slotKind === 'HALF' && startTime.trim()
      ? addClockHours(startTime, HALF_SLOT_HOURS)
      : null;
  const secondEnd =
    slotKind === 'HALF' &&
    secondHalfStart != null &&
    secondHalfStart.trim()
      ? addClockHours(secondHalfStart, HALF_SLOT_HOURS)
      : null;
  const overlaps =
    slotKind === 'HALF' &&
    secondHalfStart != null &&
    Boolean(startTime.trim()) &&
    Boolean(secondHalfStart.trim()) &&
    halfSlotsOverlap(startTime, secondHalfStart, endOverride, secondHalfEndOverride);
  const endField = (
    start: string,
    defaultEnd: string | null,
    override: string | null | undefined,
    onChange: ((value: string | null) => void) | undefined,
  ) =>
    onChange ? (
      <EndTimeField
        start={start}
        defaultEnd={defaultEnd}
        override={override}
        onChange={onChange}
        fieldInp={fieldInp}
        lbl={lbl}
      />
    ) : (
      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
        Ends {defaultEnd ?? '-'}
      </div>
    );
  const canAddSecond =
    slotKind === 'HALF' &&
    secondHalfStart == null &&
    Boolean(startTime.trim());

  const segBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 12px',
    borderRadius: 8,
    border: active ? '1.5px solid #309BB7' : '1px solid #D0D5DD',
    background: active ? 'rgba(48, 155, 183, 0.1)' : '#fff',
    color: active ? '#1B6F86' : '#374151',
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left' as const,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{heading}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          style={segBtn(slotKind === 'FULL')}
          onClick={() => onSlotKindChange('FULL')}
        >
          <div>Full day</div>
          <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.8, marginTop: 2 }}>
            7 hours · one slot
          </div>
        </button>
        <button
          type="button"
          style={segBtn(slotKind === 'HALF')}
          onClick={() => onSlotKindChange('HALF')}
        >
          <div>Half day</div>
          <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.8, marginTop: 2 }}>
            3.5 hours · up to two slots
          </div>
        </button>
      </div>

      {slotKind === 'FULL' ? (
        <div>
          <label style={lbl}>Start time *</label>
          <input
            type="time"
            style={fieldInp}
            value={startTime}
            onChange={(e) => onStartChange(e.target.value)}
          />
          {endField(startTime, fullEnd, endOverride, onEndChange)}
        </div>
      ) : null}

      {slotKind === 'HALF' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={halfSlotCardStyle}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1B6F86' }}>
                Half-day 1 (3.5 hrs)
              </span>
            </div>
            <div>
              <label style={lbl}>Start time *</label>
              <input
                type="time"
                style={fieldInp}
                value={startTime}
                onChange={(e) => onStartChange(e.target.value)}
              />
              {endField(startTime, firstEnd, endOverride, onEndChange)}
            </div>
          </div>

          {secondHalfStart != null ? (
            <div style={halfSlotCardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1B6F86' }}>
                  Half-day 2 (3.5 hrs)
                </span>
                <button
                  type="button"
                  aria-label="Remove half-day 2"
                  onClick={onRemoveSecond}
                  style={halfSlotRemoveBtnStyle}
                >
                  ×
                </button>
              </div>
              <div>
                <label style={lbl}>Start time *</label>
                <input
                  type="time"
                  style={fieldInp}
                  value={secondHalfStart}
                  onChange={(e) => onSecondChange(e.target.value)}
                />
                {endField(secondHalfStart, secondEnd, secondHalfEndOverride, onSecondEndChange)}
                {overlaps ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#B42318',
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                  >
                    Half-day slots must not overlap.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {canAddSecond ? (
            <button type="button" onClick={onAddSecond} style={halfSlotAddBtnStyle}>
              + Add second half-day (3.5 hrs)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
