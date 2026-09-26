'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrowseJob } from '@/lib/api';
import type { LocumAvailabilitySubmit } from '@/components/locum/LocumApplyModal';
import {
  formatShiftTimeRange,
  formatSpecificDate,
  getJobScheduleModel,
  getJobShifts,
  getPostingDays,
} from '@/lib/jobSchedule';

type Row = { key: string; label: string; taken: boolean; date: string };

/** Checkbox list of posting slots/days; saves via the availability endpoint. */
export function InlineAvailabilityEditor({
  job,
  label,
  initialKind,
  initialDates,
  initialShiftIds,
  saving,
  error,
  onSave,
}: {
  job: BrowseJob;
  label: string;
  initialKind: 'FULL' | 'PARTIAL';
  initialDates: string[];
  initialShiftIds: string[];
  saving: boolean;
  error?: string | null;
  onSave: (opts: LocumAvailabilitySubmit) => void;
}) {
  const shifts = useMemo(() => getJobShifts(job), [job]);
  const useShiftIds = getJobScheduleModel(job) === 'SLOTS' && shifts.some((s) => s.id);

  const rows: Row[] = useMemo(() => {
    if (useShiftIds) {
      return shifts
        .filter((s) => s.id)
        .map((s) => {
          const range = formatShiftTimeRange(s);
          return {
            key: s.id!,
            date: s.date,
            taken: s.isTaken === true,
            label: [formatSpecificDate(s.date), range].filter(Boolean).join(' · '),
          };
        });
    }
    const timeByDay = new Map<string, string>();
    for (const s of shifts) {
      const t = formatShiftTimeRange(s);
      if (t) timeByDay.set(s.date, t);
    }
    return getPostingDays(job).map((d) => ({
      key: d,
      date: d,
      taken: false,
      label: [formatSpecificDate(d), timeByDay.get(d)].filter(Boolean).join(' · '),
    }));
  }, [job, shifts, useShiftIds]);

  const openKeys = useMemo(() => rows.filter((r) => !r.taken).map((r) => r.key), [rows]);

  const initialSrcKey = (useShiftIds ? initialShiftIds : initialDates).join('|');
  const openKeysKey = openKeys.join('|');
  const initialSelection = useMemo(() => {
    const open = openKeysKey ? openKeysKey.split('|') : [];
    if (initialKind === 'FULL') return new Set(open);
    const openSet = new Set(open);
    const src = initialSrcKey ? initialSrcKey.split('|') : [];
    return new Set(src.filter((k) => openSet.has(k)));
  }, [initialKind, initialSrcKey, openKeysKey]);

  const [selected, setSelected] = useState<Set<string>>(initialSelection);
  useEffect(() => setSelected(initialSelection), [initialSelection]);

  const dirty =
    selected.size !== initialSelection.size ||
    [...selected].some((k) => !initialSelection.has(k));
  const allSelected = openKeys.length > 0 && openKeys.every((k) => selected.has(k));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    if (!dirty || selected.size === 0 || saving) return;
    if (allSelected) {
      onSave({
        availabilityKind: 'FULL',
        availableDates: [],
        ...(useShiftIds ? { shiftIds: openKeys } : {}),
      });
      return;
    }
    const chosen = rows.filter((r) => selected.has(r.key));
    onSave({
      availabilityKind: 'PARTIAL',
      availableDates: [...new Set(chosen.map((r) => r.date))].sort(),
      ...(useShiftIds ? { shiftIds: chosen.map((r) => r.key) } : {}),
    });
  }

  return (
    <div
      style={{
        background: '#F0FDFA',
        border: '1px solid #99F6E4',
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0F766E' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => {
          const checked = selected.has(r.key);
          return (
            <label
              key={r.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${checked ? '#5EEAD4' : '#E5E7EB'}`,
                background: r.taken ? '#F3F4F6' : checked ? '#CCFBF1' : '#fff',
                color: r.taken ? '#9CA3AF' : '#0F766E',
                fontSize: 13,
                fontWeight: 600,
                cursor: r.taken || saving ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={r.taken || saving}
                onChange={() => toggle(r.key)}
                style={{ width: 16, height: 16, accentColor: '#0F766E', cursor: 'inherit' }}
              />
              <span style={{ flex: 1 }}>{r.label}</span>
              {r.taken ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9A3412' }}>Filled</span>
              ) : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <div style={{ marginTop: 8, fontSize: 12, color: '#B91C1C' }}>{error}</div>
      ) : null}
      {dirty ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            marginTop: 10,
          }}
        >
          {selected.size === 0 ? (
            <span style={{ fontSize: 12, color: '#B91C1C', marginRight: 'auto' }}>
              Select at least one slot.
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setSelected(initialSelection)}
            disabled={saving}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || selected.size === 0}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: saving || selected.size === 0 ? '#94A3B8' : '#0F766E',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving || selected.size === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
