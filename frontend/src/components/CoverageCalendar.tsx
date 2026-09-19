import type { CSSProperties } from 'react';
import { applicationCoveredDays, formatSpecificDate } from '@/lib/jobSchedule';

export type CoverageApplicant = {
  id: string;
  name: string;
  status: 'APPLIED' | 'SHORTLISTED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN';
  locumResponse: 'ACCEPTED' | 'REJECTED' | null;
  availabilityKind?: 'FULL' | 'PARTIAL' | null;
  availableDates?: string[] | null;
};

type Stage = 'accepted' | 'confirmed' | 'applied';
const STAGE_STYLE: Record<Stage, { bg: string; color: string; label: string }> = {
  accepted: { bg: '#ECFDF5', color: '#047857', label: 'Accepted' },
  confirmed: { bg: '#EEF0FB', color: '#4338CA', label: 'Confirmed' },
  applied: { bg: '#F3F4F6', color: '#4B5563', label: 'Applied' },
};

function stageOf(a: CoverageApplicant): Stage | null {
  if (a.status === 'REJECTED' || a.status === 'WITHDRAWN' || a.locumResponse === 'REJECTED') {
    return null;
  }
  if (a.locumResponse === 'ACCEPTED') return 'accepted';
  if (a.status === 'CONFIRMED') return 'confirmed';
  return 'applied'; // APPLIED / SHORTLISTED
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Host-facing coverage overview: one column per posting day showing which
 * applicants can cover it and their stage, so gaps (days with no accepted
 * locum) are obvious. A day is "covered" once an accepted locum can work it.
 */
export function CoverageCalendar({
  postingDays,
  applicants,
  style,
}: {
  postingDays: string[];
  applicants: CoverageApplicant[];
  style?: CSSProperties;
}) {
  if (postingDays.length === 0) return null;
  const active = applicants
    .map((a) => ({ a, stage: stageOf(a) }))
    .filter((x): x is { a: CoverageApplicant; stage: Stage } => x.stage != null);

  const byDay = new Map<string, { a: CoverageApplicant; stage: Stage }[]>();
  for (const d of postingDays) byDay.set(d, []);
  for (const { a, stage } of active) {
    for (const day of applicationCoveredDays(a, postingDays)) {
      byDay.get(day)?.push({ a, stage });
    }
  }
  const coveredCount = postingDays.filter((d) =>
    (byDay.get(d) ?? []).some((x) => x.stage === 'accepted'),
  ).length;
  const fullyCovered = coveredCount === postingDays.length;

  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        background: '#fff',
        padding: 14,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F' }}>Coverage</div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 999,
            padding: '3px 10px',
            background: fullyCovered ? '#ECFDF5' : '#FFF7ED',
            color: fullyCovered ? '#047857' : '#9A3412',
            border: `1px solid ${fullyCovered ? '#A7F3D0' : '#FED7AA'}`,
          }}
        >
          {fullyCovered ? 'Fully covered' : `${coveredCount}/${postingDays.length} days covered`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {postingDays.map((d) => {
          const entries = byDay.get(d) ?? [];
          const dayCovered = entries.some((x) => x.stage === 'accepted');
          const [, mo, day] = d.split('-');
          return (
            <div
              key={d}
              style={{
                minWidth: 92,
                flexShrink: 0,
                border: `1px solid ${dayCovered ? '#A7F3D0' : '#FED7AA'}`,
                background: dayCovered ? '#F0FDF4' : '#FFFBF5',
                borderRadius: 8,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>
                {formatSpecificDate(d).replace(/,.*$/, '') || `${mo}-${day}`}
              </div>
              {entries.length === 0 ? (
                <span style={{ fontSize: 11, color: '#9A3412', fontWeight: 600 }}>Gap</span>
              ) : (
                entries.map(({ a, stage }) => {
                  const s = STAGE_STYLE[stage];
                  return (
                    <span
                      key={a.id}
                      title={`${a.name} - ${s.label}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: s.bg,
                        color: s.color,
                        borderRadius: 5,
                        padding: '2px 5px',
                        fontSize: 10,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: s.color, color: '#fff', fontSize: 8, fontWeight: 700,
                        }}
                      >
                        {initials(a.name)}
                      </span>
                      <span style={{ maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.name}
                      </span>
                    </span>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {(['accepted', 'confirmed', 'applied'] as Stage[]).map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: STAGE_STYLE[s].color }} />
            {STAGE_STYLE[s].label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9A3412' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: '#FED7AA', border: '1px solid #F59E0B' }} />
          Gap (no accepted locum)
        </span>
      </div>
    </div>
  );
}
