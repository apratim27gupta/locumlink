import type { CSSProperties } from 'react';
import {
  getJobShifts,
  getJobScheduleType,
  getJobDateRanges,
  formatDateRange,
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
}: {
  job: JobScheduleLike;
  tone?: JobScheduleTone;
  fontSize?: number | string;
  style?: CSSProperties;
}) {
  const shifts = getJobShifts(job);
  if (shifts.length === 0) return null;
  const t = TONES[tone];

  // "Multiple date ranges" posting: show grouped ranges, each with its time.
  if (getJobScheduleType(job) === 'RANGES') {
    const ranges = getJobDateRanges(job);
    const rangeTimes = ranges.map((r) =>
      formatShiftTimeRange({ date: r.startDate, startTime: r.startTime, endTime: r.endTime }),
    );
    const showTime = rangeTimes.some(Boolean) && new Set(rangeTimes.map((r) => r ?? '')).size > 1;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, ...style }}>
        <span
          title="This posting is for multiple date ranges, not one continuous range."
          style={{
            background: t.bg, border: `1px solid ${t.border}`, padding: '5px 10px',
            borderRadius: 5, fontSize, fontWeight: 600, color: t.color,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <MiniCalendarIcon color={t.color} />
          {ranges.length} date range{ranges.length === 1 ? '' : 's'}
        </span>
        {ranges.map((r, i) => (
          <span
            key={`${r.startDate}-${r.endDate}`}
            style={{
              background: t.pillBg, border: `1px solid ${t.border}`, padding: '4px 9px',
              borderRadius: 5, fontSize, fontWeight: 500, color: t.color, whiteSpace: 'nowrap',
            }}
          >
            {formatDateRange(r)}
            {showTime && rangeTimes[i] ? ` · ${rangeTimes[i]}` : ''}
          </span>
        ))}
      </div>
    );
  }

  // Only surface per-day times when they actually differ between days; if every
  // day shares one time, the separate time chip already covers it.
  const timeRanges = shifts.map((s) => formatShiftTimeRange(s));
  const anyTimes = timeRanges.some(Boolean);
  const uniqueTimes = new Set(timeRanges.map((r) => r ?? ''));
  const showPerDayTime = anyTimes && uniqueTimes.size > 1;

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
        title="This posting is for a set of specific dates, not a continuous range."
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
        {shifts.length} specific date{shifts.length === 1 ? '' : 's'}
      </span>
      {shifts.map((s, i) => (
        <span
          key={s.date}
          style={{
            background: t.pillBg,
            border: `1px solid ${t.border}`,
            padding: '4px 9px',
            borderRadius: 5,
            fontSize,
            fontWeight: 500,
            color: t.color,
            whiteSpace: 'nowrap',
          }}
        >
          {formatSpecificDate(s.date)}
          {showPerDayTime && timeRanges[i] ? ` · ${timeRanges[i]}` : ''}
        </span>
      ))}
    </div>
  );
}
