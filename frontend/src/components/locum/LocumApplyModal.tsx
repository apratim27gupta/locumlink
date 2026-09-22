'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BrowseJob } from '@/lib/api';
import {
  getPostingDays,
  formatSpecificDate,
  formatShiftTimeRange,
  getJobShifts,
  getJobScheduleModel,
  HALF_SLOT_HOURS,
  FULL_SLOT_HOURS,
} from '@/lib/jobSchedule';

const TEAL = '#309BB7';
const TEAL_DARK = '#1B6F86';

export type LocumAvailabilitySubmit = {
  availabilityKind: 'FULL' | 'PARTIAL';
  availableDates: string[];
  shiftIds?: string[];
  coverNote?: string;
};

/**
 * Apply or update availability: FULL vs PARTIAL days/shifts + optional cover note (apply only).
 */
export function LocumApplyModal({
  job,
  applying,
  error,
  mode = 'apply',
  initialKind = 'FULL',
  initialDates = [],
  initialShiftIds = [],
  initialNote = '',
  onSubmit,
  onClose,
}: {
  job: BrowseJob;
  applying: boolean;
  error?: string;
  mode?: 'apply' | 'edit';
  initialKind?: 'FULL' | 'PARTIAL';
  initialDates?: string[];
  initialShiftIds?: string[];
  initialNote?: string;
  onSubmit: (opts: LocumAvailabilitySubmit) => void;
  onClose: () => void;
}) {
  const isSlots = getJobScheduleModel(job) === 'SLOTS';
  const postingDays = useMemo(() => getPostingDays(job), [job]);
  const shifts = useMemo(() => getJobShifts(job), [job]);
  const hasShiftIds = isSlots && shifts.some((s) => s.id);
  const takenShiftIds = useMemo(
    () => new Set(shifts.filter((s) => s.id && s.isTaken).map((s) => s.id!)),
    [shifts],
  );
  const openShifts = useMemo(
    () => shifts.filter((s) => s.id && !takenShiftIds.has(s.id)),
    [shifts, takenShiftIds],
  );
  const timeByDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shifts) {
      const t = formatShiftTimeRange(s);
      if (t) m.set(s.date, t);
    }
    return m;
  }, [shifts]);
  const [kind, setKind] = useState<'FULL' | 'PARTIAL'>(initialKind);
  const [days, setDays] = useState<Set<string>>(() => new Set(initialDates));
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(
    () => new Set(initialShiftIds.filter((id) => !takenShiftIds.has(id))),
  );
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    setKind(initialKind);
    setDays(new Set(initialDates));
    setSelectedShiftIds(
      new Set(initialShiftIds.filter((id) => !takenShiftIds.has(id))),
    );
    setNote(initialNote);
  }, [initialKind, initialDates, initialShiftIds, initialNote, job.id, takenShiftIds]);

  function toggleDay(d: string) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function toggleShift(id: string) {
    if (takenShiftIds.has(id)) return;
    setSelectedShiftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const openSelectedCount = [...selectedShiftIds].filter((id) => !takenShiftIds.has(id)).length;
  const canSubmit =
    kind === 'FULL'
      ? hasShiftIds
        ? openShifts.length > 0
        : true
      : hasShiftIds
        ? openSelectedCount > 0
        : days.size > 0;
  const isEdit = mode === 'edit';
  const takenCount = takenShiftIds.size;

  function handleSubmit() {
    if (!canSubmit || applying) return;
    const shiftIds =
      kind === 'FULL'
        ? hasShiftIds
          ? openShifts.map((s) => s.id).filter((id): id is string => !!id)
          : undefined
        : hasShiftIds
          ? [...selectedShiftIds].filter((id) => !takenShiftIds.has(id))
          : undefined;
    const availableDates =
      kind === 'PARTIAL'
        ? hasShiftIds
          ? [
              ...new Set(
                shifts
                  .filter((s) => s.id && selectedShiftIds.has(s.id) && !takenShiftIds.has(s.id))
                  .map((s) => s.date),
              ),
            ].sort()
          : [...days].sort()
        : [];
    onSubmit({
      availabilityKind: kind,
      availableDates,
      ...(shiftIds ? { shiftIds } : {}),
      ...(isEdit ? {} : { coverNote: note.trim() || undefined }),
    });
  }

  function optBtn(active: boolean): CSSProperties {
    return {
      flex: 1,
      padding: '10px 12px',
      borderRadius: 8,
      border: `1px solid ${active ? TEAL : '#E5E7EB'}`,
      background: active ? 'rgba(48,155,183,0.10)' : '#fff',
      color: active ? TEAL_DARK : '#374151',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
    };
  }

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (!applying && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 'min(480px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          fontFamily: 'Inter, sans-serif',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #EEF0F3' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0B0F1F' }}>
            {isEdit ? 'Update availability' : 'Apply to this shift'}
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{job.title}</div>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Your availability
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={optBtn(kind === 'FULL')} onClick={() => setKind('FULL')}>
                {hasShiftIds ? 'Available for all slots' : 'Available for all dates'}
              </button>
              <button type="button" style={optBtn(kind === 'PARTIAL')} onClick={() => setKind('PARTIAL')}>
                {hasShiftIds ? 'Only some slots' : 'Only some dates'}
              </button>
            </div>
            {hasShiftIds && takenCount > 0 ? (
              <div style={{ fontSize: 12, color: '#9A3412', marginTop: 8, lineHeight: 1.4 }}>
                {takenCount} slot{takenCount === 1 ? '' : 's'} already filled by another locum
                {kind === 'FULL' ? ' - those will be skipped.' : ' and can’t be selected.'}
              </div>
            ) : null}
          </div>

          {kind === 'PARTIAL' && hasShiftIds && (
            <div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
                Pick the slots you can cover ({openSelectedCount} selected
                {takenCount > 0 ? `, ${takenCount} filled` : ''}).
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 280, overflowY: 'auto' }}>
                {(() => {
                  const byDay = new Map<string, typeof shifts>();
                  for (const s of shifts) {
                    if (!s.id) continue;
                    const list = byDay.get(s.date) ?? [];
                    list.push(s);
                    byDay.set(s.date, list);
                  }
                  return [...byDay.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([day, dayShifts]) => {
                      const ordered = [...dayShifts].sort((a, b) =>
                        (a.startTime ?? '').localeCompare(b.startTime ?? ''),
                      );
                      return (
                        <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B6F86' }}>
                            {formatSpecificDate(day)}
                          </div>
                          {ordered.map((s) => {
                            if (!s.id) return null;
                            const taken = takenShiftIds.has(s.id);
                            const on = !taken && selectedShiftIds.has(s.id);
                            const kindLabel =
                              s.slotKind === 'HALF'
                                ? 'Half day'
                                : s.slotKind === 'FULL'
                                  ? 'Full day'
                                  : 'Slot';
                            const hours =
                              s.hours ??
                              (s.slotKind === 'HALF' ? HALF_SLOT_HOURS : FULL_SLOT_HOURS);
                            const range = formatShiftTimeRange(s);
                            const detail = [
                              kindLabel,
                              range,
                              `${hours} hrs`,
                            ]
                              .filter(Boolean)
                              .join(' · ');
                            return (
                              <button
                                key={s.id}
                                type="button"
                                disabled={taken}
                                onClick={() => toggleShift(s.id!)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  textAlign: 'left',
                                  padding: '9px 11px',
                                  borderRadius: 8,
                                  cursor: taken ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit',
                                  border: `1px solid ${taken ? '#E5E7EB' : on ? TEAL : '#E5E7EB'}`,
                                  background: taken ? '#F3F4F6' : on ? 'rgba(48,155,183,0.08)' : '#fff',
                                  opacity: taken ? 0.72 : 1,
                                }}
                              >
                                <span
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    flexShrink: 0,
                                    border: `1px solid ${taken ? '#D1D5DB' : on ? TEAL : '#D1D5DB'}`,
                                    background: taken ? '#E5E7EB' : on ? TEAL : '#fff',
                                    color: '#fff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 12,
                                  }}
                                >
                                  {on ? '✓' : ''}
                                </span>
                                <span
                                  style={{
                                    fontSize: 13,
                                    color: taken ? '#9CA3AF' : '#374151',
                                    fontWeight: 500,
                                    flex: 1,
                                  }}
                                >
                                  {detail}
                                </span>
                                {taken ? (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: '#B45309',
                                      background: '#FFFBEB',
                                      border: '1px solid #FDE68A',
                                      borderRadius: 999,
                                      padding: '2px 8px',
                                      flexShrink: 0,
                                    }}
                                  >
                                    Filled
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      );
                    });
                })()}
              </div>
            </div>
          )}

          {kind === 'PARTIAL' && !hasShiftIds && (
            <div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
                Pick the days you can cover ({days.size} selected).
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                {postingDays.map((d) => {
                  const on = days.has(d);
                  const t = timeByDay.get(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1px solid ${on ? TEAL : '#E5E7EB'}`,
                        background: on ? 'rgba(48,155,183,0.08)' : '#fff',
                      }}
                    >
                      <span
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `1px solid ${on ? TEAL : '#D1D5DB'}`, background: on ? TEAL : '#fff',
                          color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                        }}
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1B6F86' }}>{formatSpecificDate(d)}</span>
                      {t && <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>{t}</span>}
                    </button>
                  );
                })}
                {postingDays.length === 0 && (
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>This posting has no dated schedule.</span>
                )}
              </div>
            </div>
          )}

          {!isEdit && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Note to host (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anything the host should know about your availability."
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid #D0D5DD', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit', color: '#0B0F1F', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{error}</p>}
        </div>

        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #EEF0F3',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            disabled={applying}
            onClick={onClose}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              border: '1px solid #D0D5DD',
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              fontWeight: 600,
              cursor: applying ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || applying}
            onClick={handleSubmit}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: !canSubmit || applying ? '#9CA3AF' : 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: !canSubmit || applying ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {applying
              ? isEdit
                ? 'Saving…'
                : 'Submitting…'
              : isEdit
                ? 'Save availability'
                : 'Submit application'}
          </button>
        </div>
      </div>
    </div>
  );
}
