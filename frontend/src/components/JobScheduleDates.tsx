import type { CSSProperties } from 'react';
import {
  getJobShifts,
  getJobScheduleType,
  formatShiftTimeRange,
  formatSpecificDate,
  type JobScheduleLike,
} from '@/lib/jobSchedule';

const TONES = {
  teal: {
    color: '#309BB7',
    bg: 'rgba(48, 155, 183, 0.14)',
    border: 'rgba(48, 155, 183, 0.28)',
    pillBg: 'rgba(48, 155, 183, 0.08)',
  },
  neutral: {
    color: '#374151',
    bg: '#F3F4F6',
    border: '#E5E7EB',
    pillBg: '#F9FAFB',
  },
} as const;

export type JobScheduleTone = keyof typeof TONES;

function MiniCalendarIcon({ color }: { color: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.8" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Renders a job's individually chosen days as a "N specific dates" tag followed
 * by one pill per day. Use only when the schedule is in "list" mode
 * (getJobScheduleMode === 'list'); range postings keep their own start–end chip.
 */
export function JobScheduleDates({
  job,
  tone = 'neutral',
  fontSize = 'var(--font-small)',
  style,
  highlightShiftIds,
}: {
  job: JobScheduleLike;
  tone?: JobScheduleTone;
  fontSize?: number | string;
  style?: CSSProperties;
  /** When set, highlighted shifts use the tone; others render muted. */
  highlightShiftIds?: string[] | null;
}) {
  const shifts = getJobShifts(job);
  if (shifts.length === 0) return null;
  const t = TONES[tone];
  const muted = TONES.neutral;
  const highlight =
    highlightShiftIds != null && highlightShiftIds.length > 0
      ? new Set(highlightShiftIds)
      : null;

  // Prefer one pill per shift (unique keys for same-day halves / full slots).
  const timeRanges = shifts.map((s) => formatShiftTimeRange(s));
  const anyTimes = timeRanges.some(Boolean);
  const uniqueTimes = new Set(timeRanges.map((r) => r ?? ''));
  const showPerDayTime = anyTimes && (uniqueTimes.size > 1 || getJobScheduleType(job) === 'RANGES');
  const slotCount = shifts.length;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      <span
        title="Total slots in this posting."
        style={{
          background: t.bg,
          border: `1px solid ${t.border}`,
          padding: '5px 10px',
          borderRadius: 5,
          fontSize,
          fontWeight: 600,
          color: t.color,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <MiniCalendarIcon color={t.color} />
        {slotCount} total slot{slotCount === 1 ? '' : 's'}
      </span>
      {shifts.map((s, i) => {
        const on = !highlight || (s.id != null && highlight.has(s.id));
        const pill = on ? t : muted;
        return (
          <span
            key={s.id ?? `${s.date}-${s.startTime ?? ''}-${s.endTime ?? ''}-${i}`}
            style={{
              background: on ? pill.pillBg : '#fff',
              border: `1px solid ${pill.border}`,
              padding: '4px 9px',
              borderRadius: 5,
              fontSize,
              fontWeight: on ? 600 : 500,
              color: pill.color,
              whiteSpace: 'nowrap',
            }}
          >
            {formatSpecificDate(s.date)}
            {showPerDayTime && timeRanges[i] ? ` · ${timeRanges[i]}` : ''}
          </span>
        );
      })}
    </div>
  );
}
