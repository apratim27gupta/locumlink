import { formatLocalCalendarDateForDisplay } from '@/lib/localDateTime';

/**
 * Single source of truth for reading and describing a job's schedule.
 *
 * A posting is scheduled one of two ways:
 *  - "range": a continuous span of days (startDate → endDate), the classic mode.
 *  - "list":  a set of individually chosen calendar days (the `dates` array).
 *
 * The backend stores individually chosen days as Shift rows and returns them as
 * a `dates: string[]` of YYYY-MM-DD. When that array is non-empty the posting is
 * a specific-dates posting and should be shown as a list, never as a range.
 */

export type JobShiftLike = {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
};

export type JobScheduleLike = {
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  dates?: unknown;
  shifts?: unknown;
  scheduleType?: unknown;
};

export type JobScheduleMode = 'none' | 'range' | 'list';

/** Normalized, de-duplicated, ascending YYYY-MM-DD list of individually chosen days. */
export function getJobSpecificDates(job: JobScheduleLike | null | undefined): string[] {
  const raw = (job as { dates?: unknown } | null | undefined)?.dates;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const cal = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cal)) seen.add(cal);
  }
  return [...seen].sort();
}

/**
 * Normalized shift objects for a specific-dates posting, ascending by date.
 * Falls back to the bare `dates` array (no per-day times) for older payloads,
 * and to the posting-level start/end time when a shift carries no time of its own.
 */
export function getJobShifts(job: JobScheduleLike | null | undefined): JobShiftLike[] {
  const raw = (job as { shifts?: unknown } | null | undefined)?.shifts;
  const fallbackStart = job?.startTime ?? null;
  const fallbackEnd = job?.endTime ?? null;
  if (Array.isArray(raw) && raw.length > 0) {
    const rows: JobShiftLike[] = [];
    for (const r of raw) {
      const date = (r as { date?: unknown })?.date;
      if (typeof date !== 'string') continue;
      const cal = date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cal)) continue;
      const st = (r as { startTime?: unknown }).startTime;
      const en = (r as { endTime?: unknown }).endTime;
      rows.push({
        date: cal,
        startTime: typeof st === 'string' && st ? st : fallbackStart,
        endTime: typeof en === 'string' && en ? en : fallbackEnd,
      });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }
  // Older payloads only send `dates`; apply the posting-level time to each.
  return getJobSpecificDates(job).map((date) => ({
    date,
    startTime: fallbackStart,
    endTime: fallbackEnd,
  }));
}

export function getJobScheduleMode(job: JobScheduleLike | null | undefined): JobScheduleMode {
  if (getJobSpecificDates(job).length > 0) return 'list';
  if (job?.startDate || job?.endDate) return 'range';
  return 'none';
}

/** 'DATES' (individual days) or 'RANGES' (multiple date ranges), else null. */
export function getJobScheduleType(
  job: JobScheduleLike | null | undefined,
): 'DATES' | 'RANGES' | null {
  const v = (job as { scheduleType?: unknown } | null | undefined)?.scheduleType;
  return v === 'RANGES' || v === 'DATES' ? v : null;
}

export type JobDateRange = {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
};

function nextCalendarDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * Group a posting's individual shift days back into contiguous ranges that share
 * the same start/end time (how a "multiple date ranges" posting is displayed).
 */
export function getJobDateRanges(job: JobScheduleLike | null | undefined): JobDateRange[] {
  const ranges: JobDateRange[] = [];
  for (const s of getJobShifts(job)) {
    const prev = ranges[ranges.length - 1];
    if (
      prev &&
      nextCalendarDay(prev.endDate) === s.date &&
      prev.startTime === (s.startTime ?? null) &&
      prev.endTime === (s.endTime ?? null)
    ) {
      prev.endDate = s.date;
    } else {
      ranges.push({
        startDate: s.date,
        endDate: s.date,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
      });
    }
  }
  return ranges;
}

/** Inclusive list of ISO days (YYYY-MM-DD) from start to end; capped for safety. */
export function expandIsoDateRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some(Number.isNaN)) return out;
  let cur = Date.UTC(sy, sm - 1, sd);
  const last = Date.UTC(ey, em - 1, ed);
  if (last < cur) return out;
  for (let i = 0; cur <= last && i < 400; i++) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
  }
  return out;
}

/**
 * Every calendar day (YYYY-MM-DD) the posting needs covered: the individually
 * chosen shift days when present, otherwise the days spanned by the continuous
 * start/end range. This is what a locum picks their availability from.
 */
export function getPostingDays(job: JobScheduleLike | null | undefined): string[] {
  const shifts = getJobShifts(job);
  if (shifts.length > 0) {
    return [...new Set(shifts.map((s) => s.date))].sort();
  }
  const start = job?.startDate ? job.startDate.slice(0, 10) : '';
  const end = job?.endDate ? job.endDate.slice(0, 10) : '';
  if (start && end) return expandIsoDateRange(start, end);
  if (start) return [start];
  return [];
}

export type ApplicationAvailability = {
  availabilityKind?: string | null;
  availableDates?: string[] | null;
};

/** Normalized set of days an application covers, given the posting's days. */
export function applicationCoveredDays(
  app: ApplicationAvailability,
  postingDays: string[],
): string[] {
  const isPartial =
    app.availabilityKind === 'PARTIAL' &&
    Array.isArray(app.availableDates) &&
    app.availableDates.length > 0;
  if (!isPartial) return [...postingDays];
  const wanted = new Set(
    (app.availableDates ?? []).map((d) => d.slice(0, 10)),
  );
  return postingDays.filter((d) => wanted.has(d));
}

/** True when an application only covers part of the posting's days. */
export function isPartialAvailability(app: ApplicationAvailability): boolean {
  return (
    app.availabilityKind === 'PARTIAL' &&
    Array.isArray(app.availableDates) &&
    app.availableDates.length > 0
  );
}

/** "Jun 1, 2026" for a single day, or "Jun 1, 2026 - Jun 5, 2026" for a span. */
export function formatDateRange(range: JobDateRange): string {
  const start = formatSpecificDate(range.startDate);
  if (range.startDate === range.endDate) return start;
  return `${start} - ${formatSpecificDate(range.endDate)}`;
}

/** UTC "HH:mm" combined with a calendar day, formatted as a local time like "9:00 AM". */
function utcClockToLocal(dateIso: string, hhmm: string): string | null {
  const d = new Date(`${dateIso}T${hhmm}:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** True when a specific-dates posting's days don't all share one start/end time. */
export function hasVaryingShiftTimes(job: JobScheduleLike | null | undefined): boolean {
  const shifts = getJobShifts(job);
  if (shifts.length < 2) return false;
  const keys = new Set(shifts.map((s) => `${s.startTime ?? ''}|${s.endTime ?? ''}`));
  return keys.size > 1;
}

/** Local time range for a shift, e.g. "9:00 AM - 5:00 PM", or null when it has no times. */
export function formatShiftTimeRange(shift: JobShiftLike): string | null {
  const start = shift.startTime ? utcClockToLocal(shift.date, shift.startTime) : null;
  const end = shift.endTime ? utcClockToLocal(shift.date, shift.endTime) : null;
  if (!start && !end) return null;
  return `${start ?? '-'} - ${end ?? '-'}`;
}

/** Human date, e.g. "Jun 18, 2026", from a YYYY-MM-DD calendar day (no UTC shift). */
export function formatSpecificDate(iso: string): string {
  return formatLocalCalendarDateForDisplay(iso);
}

/** All chosen days formatted for display, ascending. */
export function formatSpecificDates(job: JobScheduleLike | null | undefined): string[] {
  return getJobSpecificDates(job).map(formatSpecificDate);
}

/**
 * Compact one-line label describing the schedule, for tight spaces (tooltips,
 * dense rows). Detail surfaces should enumerate the days instead.
 */
export function formatScheduleSummaryText(
  job: JobScheduleLike | null | undefined,
  rangeLabel: string,
): string {
  const mode = getJobScheduleMode(job);
  if (mode === 'list') {
    if (getJobScheduleType(job) === 'RANGES') {
      const ranges = getJobDateRanges(job);
      if (ranges.length === 1) return formatDateRange(ranges[0]);
      if (ranges.length <= 2) return ranges.map(formatDateRange).join(', ');
      const first = formatSpecificDate(ranges[0].startDate);
      const last = formatSpecificDate(ranges[ranges.length - 1].endDate);
      return `${ranges.length} date ranges (${first} - ${last})`;
    }
    const dates = formatSpecificDates(job);
    if (dates.length === 1) return dates[0];
    if (dates.length <= 3) return dates.join(', ');
    return `${dates.length} specific dates (${dates[0]} - ${dates[dates.length - 1]})`;
  }
  return rangeLabel;
}
