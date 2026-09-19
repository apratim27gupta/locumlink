'use client';

import { useMemo, useState } from 'react';
import type { BrowseJob } from '@/lib/api';
import { getPostingDays, formatSpecificDate, formatShiftTimeRange, getJobShifts } from '@/lib/jobSchedule';

const TEAL = '#309BB7';
const TEAL_DARK = '#1B6F86';

/**
 * Apply flow: the locum declares availability for the whole schedule or only some
 * days, plus an optional note. Submits { availabilityKind, availableDates, coverNote }.
 */
export function LocumApplyModal({
  job,
  applying,
  error,
  onSubmit,
  onClose,
}: {
  job: BrowseJob;
  applying: boolean;
  error?: string;
  onSubmit: (opts: { availabilityKind: 'FULL' | 'PARTIAL'; availableDates: string[]; coverNote?: string }) => void;
  onClose: () => void;
}) {
  const postingDays = useMemo(() => getPostingDays(job), [job]);
  const timeByDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of getJobShifts(job)) {
      const t = formatShiftTimeRange(s);
      if (t) m.set(s.date, t);
    }
    return m;
  }, [job]);
  const [kind, setKind] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [days, setDays] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  function toggleDay(d: string) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  const canSubmit = kind === 'FULL' || days.size > 0;

  function handleSubmit() {
    if (!canSubmit || applying) return;
    onSubmit({
      availabilityKind: kind,
      availableDates: kind === 'PARTIAL' ? [...days].sort() : [],
      coverNote: note.trim() || undefined,
    });
  }

  const optBtn = (active: boolean) => ({
    flex: 1,
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${active ? TEAL : '#D0D5DD'}`,
    background: active ? 'rgba(48,155,183,0.10)' : '#fff',
    color: active ? TEAL_DARK : '#374151',
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,21,35,0.45)', zIndex: 12000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(15,21,35,0.25)',
        }}
      >
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #EEF0F3' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0B0F1F' }}>Apply to this shift</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{job.title}</div>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Your availability
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={optBtn(kind === 'FULL')} onClick={() => setKind('FULL')}>
                Available for all dates
              </button>
              <button type="button" style={optBtn(kind === 'PARTIAL')} onClick={() => setKind('PARTIAL')}>
                Only some dates
              </button>
            </div>
          </div>

          {kind === 'PARTIAL' && (
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

          {error && <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{error}</p>}
        </div>

        <div style={{ padding: '14px 18px', borderTop: '1px solid #EEF0F3', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff',
              color: '#374151', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || applying}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: !canSubmit || applying ? '#9CA3AF' : 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
              color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              cursor: !canSubmit || applying ? 'default' : 'pointer',
            }}
          >
            {applying ? 'Applying...' : 'Submit application'}
          </button>
        </div>
      </div>
    </div>
  );
}
