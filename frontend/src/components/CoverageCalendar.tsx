import type { CSSProperties } from 'react';
import {
  applicationCoveredDays,
  applicationCoveredShiftIds,
  formatSpecificDate,
  getDaySlotSegments,
  getJobScheduleModel,
  getPostingSlots,
  type JobScheduleLike,
} from '@/lib/jobSchedule';

export type CoverageApplicant = {
  id: string;
  name: string;
  status: 'APPLIED' | 'SHORTLISTED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN';
  locumResponse: 'ACCEPTED' | 'REJECTED' | null;
  availabilityKind?: 'FULL' | 'PARTIAL' | null;
  availableDates?: string[] | null;
  requestedShiftIds?: string[] | null;
  shiftClaims?: { shiftId: string }[] | null;
};

type Stage = 'accepted' | 'confirmed' | 'shortlisted' | 'applied';
/** Chip/legend styles — workflow order in legend: applied → shortlisted → confirmed → accepted. */
const STAGE_STYLE: Record<Stage, { bg: string; color: string; label: string }> = {
  applied: {
    bg: '#F3F4F6',
    color: '#4B5563',
    label: 'Locum applied',
  },
  shortlisted: {
    bg: '#FFF7ED',
    color: '#C2410C',
    label: 'Shortlisted by host',
  },
  confirmed: {
    bg: '#EEF0FB',
    color: '#4338CA',
    label: 'Confirmed by host',
  },
  accepted: {
    bg: '#ECFDF5',
    color: '#047857',
    label: 'Accepted by locum',
  },
};

const LEGEND_STAGE_ORDER: Stage[] = [
  'applied',
  'shortlisted',
  'confirmed',
  'accepted',
];

function stageOf(a: CoverageApplicant): Stage | null {
  if (a.status === 'REJECTED' || a.status === 'WITHDRAWN' || a.locumResponse === 'REJECTED') {
    return null;
  }
  if (a.locumResponse === 'ACCEPTED') return 'accepted';
  if (a.status === 'CONFIRMED') return 'confirmed';
  if (a.status === 'SHORTLISTED') return 'shortlisted';
  return 'applied';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function ApplicantChip({ a, stage }: { a: CoverageApplicant; stage: Stage }) {
  const s = STAGE_STYLE[stage];
  return (
    <span
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
          width: 15,
          height: 15,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: s.color,
          color: '#fff',
          fontSize: 8,
          fontWeight: 700,
        }}
      >
        {initials(a.name)}
      </span>
      <span style={{ maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
    </span>
  );
}

/**
 * Host-facing coverage overview. LEGACY: one column per day.
 * SLOTS: one column per day; dual halves split into top/bottom with per-slot gaps.
 */
export function CoverageCalendar({
  postingDays,
  applicants,
  job,
  style,
}: {
  postingDays: string[];
  applicants: CoverageApplicant[];
  job?: JobScheduleLike | null;
  style?: CSSProperties;
}) {
  if (postingDays.length === 0) return null;
  const active = applicants
    .map((a) => ({ a, stage: stageOf(a) }))
    .filter((x): x is { a: CoverageApplicant; stage: Stage } => x.stage != null);

  const isSlots = job != null && getJobScheduleModel(job) === 'SLOTS' && getPostingSlots(job).length > 0;

  if (isSlots && job) {
    const daySegs = getDaySlotSegments(job, []);
    const allShiftIds = daySegs.flatMap((d) => d.segments.map((s) => s.shiftId));
    const byShift = new Map<string, { a: CoverageApplicant; stage: Stage }[]>();
    for (const id of allShiftIds) byShift.set(id, []);
    for (const { a, stage } of active) {
      for (const id of applicationCoveredShiftIds(a, job)) {
        byShift.get(id)?.push({ a, stage });
      }
    }
    const coveredSlotCount = allShiftIds.filter((id) =>
      (byShift.get(id) ?? []).some((x) => x.stage === 'accepted'),
    ).length;
    const fullyCovered = coveredSlotCount === allShiftIds.length && allShiftIds.length > 0;

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
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
            {fullyCovered
              ? 'Fully covered'
              : `${coveredSlotCount}/${allShiftIds.length} slots covered`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {daySegs.map((day) => {
            const [, mo, dayNum] = day.date.split('-');
            const anyAccepted = day.segments.some((seg) =>
              (byShift.get(seg.shiftId) ?? []).some((x) => x.stage === 'accepted'),
            );
            const allAccepted = day.segments.every((seg) =>
              (byShift.get(seg.shiftId) ?? []).some((x) => x.stage === 'accepted'),
            );
            return (
              <div
                key={day.date}
                style={{
                  minWidth: day.segments.length > 1 ? 110 : 92,
                  flexShrink: 0,
                  border: `1px solid ${allAccepted ? '#A7F3D0' : anyAccepted ? '#FDE68A' : '#FED7AA'}`,
                  background: allAccepted ? '#F0FDF4' : '#FFFBF5',
                  borderRadius: 8,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>
                  {formatSpecificDate(day.date).replace(/,.*$/, '') || `${mo}-${dayNum}`}
                </div>
                {day.segments.map((seg) => {
                  const entries = byShift.get(seg.shiftId) ?? [];
                  const slotCovered = entries.some((x) => x.stage === 'accepted');
                  return (
                    <div
                      key={seg.shiftId}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        paddingTop: day.segments.length > 1 ? 4 : 0,
                        borderTop:
                          day.segments.length > 1 && day.segments.indexOf(seg) > 0
                            ? '1px dashed #E5E7EB'
                            : undefined,
                      }}
                    >
                      {day.segments.length > 1 || seg.slotKind === 'HALF' ? (
                        <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600 }}>
                          {seg.slotKind === 'HALF' ? 'Half' : 'Full'}
                          {seg.label.includes('·')
                            ? ` · ${seg.label.split('·')[1]?.trim()}`
                            : ''}
                        </div>
                      ) : null}
                      {!slotCovered && entries.length === 0 ? (
                        <span style={{ fontSize: 11, color: '#9A3412', fontWeight: 600 }}>Gap</span>
                      ) : entries.length === 0 ? (
                        <span style={{ fontSize: 11, color: '#9A3412', fontWeight: 600 }}>Gap</span>
                      ) : (
                        entries.map(({ a, stage }) => (
                          <ApplicantChip key={`${seg.shiftId}-${a.id}`} a={a} stage={stage} />
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          {LEGEND_STAGE_ORDER.map((s) => (
            <span
              key={s}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: STAGE_STYLE[s].color }} />
              {STAGE_STYLE[s].label}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9A3412' }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: '#FED7AA',
                border: '1px solid #F59E0B',
              }}
            />
            Gap (no accepted locum on slot)
          </span>
        </div>
      </div>
    );
  }

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
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
                entries.map(({ a, stage }) => <ApplicantChip key={a.id} a={a} stage={stage} />)
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {LEGEND_STAGE_ORDER.map((s) => (
          <span
            key={s}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}
          >
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: STAGE_STYLE[s].color }} />
            {STAGE_STYLE[s].label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9A3412' }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: '#FED7AA',
              border: '1px solid #F59E0B',
            }}
          />
          Gap (no accepted locum)
        </span>
      </div>
    </div>
  );
}
