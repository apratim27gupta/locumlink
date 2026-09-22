import {
  formatLocalCalendarDateForDisplay,
  utcPartsToLocalInputValues,
} from '@/lib/localDateTime';

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
  id?: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  shiftType?: string | null;
  slotKind?: 'HALF' | 'FULL' | null;
  hours?: number | null;
  isTaken?: boolean;
};

export type JobScheduleLike = {
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  dates?: unknown;
  shifts?: unknown;
  scheduleType?: unknown;
  scheduleModel?: unknown;
};

export const HALF_SLOT_HOURS = 3.5;
export const FULL_SLOT_HOURS = 7;

/** Preview end time from start HH:mm + hours (mirrors backend addClockHours). */
export function addClockHours(startHm: string, hours: number): string | null {
  const m = startHm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const total = Math.round(h * 60 + min + hours * 60);
  if (total < 0 || total > 23 * 60 + 59) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Local HH:mm → minutes from midnight, or null if invalid. */
export function clockToMinutes(hm: string): number | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** True when two half-day windows (start + 3.5h) overlap on the same day. */
export function halfSlotsOverlap(startA: string, startB: string): boolean {
  const a0 = clockToMinutes(startA);
  const b0 = clockToMinutes(startB);
  if (a0 == null || b0 == null) return false;
  const dur = Math.round(HALF_SLOT_HOURS * 60);
  const a1 = a0 + dur;
  const b1 = b0 + dur;
  return a0 < b1 && b0 < a1;
}

export function getJobScheduleModel(
  job: JobScheduleLike | null | undefined,
): 'LEGACY' | 'SLOTS' {
  const v = (job as { scheduleModel?: unknown } | null | undefined)?.scheduleModel;
  return v === 'SLOTS' ? 'SLOTS' : 'LEGACY';
}

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
      const id = (r as { id?: unknown }).id;
      const slotKindRaw = (r as { slotKind?: unknown }).slotKind;
      const shiftType = (r as { shiftType?: unknown }).shiftType;
      const hours = (r as { hours?: unknown }).hours;
      const isTaken = (r as { isTaken?: unknown }).isTaken === true;
      const slotKind =
        slotKindRaw === 'HALF' || slotKindRaw === 'FULL'
          ? slotKindRaw
          : shiftType === 'HALF_DAY' ||
              shiftType === 'HALF_DAY_AM' ||
              shiftType === 'HALF_DAY_PM'
            ? ('HALF' as const)
            : shiftType === 'FULL_DAY'
              ? ('FULL' as const)
              : null;
      rows.push({
        id: typeof id === 'string' ? id : undefined,
        date: cal,
        startTime: typeof st === 'string' && st ? st : fallbackStart,
        endTime: typeof en === 'string' && en ? en : fallbackEnd,
        shiftType: typeof shiftType === 'string' ? shiftType : null,
        slotKind,
        hours: typeof hours === 'number' ? hours : null,
        isTaken,
      });
    }
    return rows.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.startTime ?? '').localeCompare(b.startTime ?? '');
    });
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

/** Per-day slot config used by the host SLOTS schedule editor. */
export type SlotsDayEditorConfig = {
  start: string;
  slotKind: 'HALF' | 'FULL' | '';
  secondHalfStart: string | null;
};

export type InferredSlotsRangeRow = {
  startDate: string;
  endDate: string;
  startTime: string;
  slotKind: 'HALF' | 'FULL' | '';
  secondHalfStart: string | null;
};

export type InferredSlotsScheduleEditorState = {
  scheduleKind: 'range' | 'list' | 'ranges';
  /** Continuous-range start (YYYY-MM-DD), empty when not range. */
  startDate: string;
  /** Continuous-range end (YYYY-MM-DD), empty when not range. */
  endDate: string;
  startTime: string;
  slotKind: 'HALF' | 'FULL' | '';
  secondHalfStart: string | null;
  dateRanges: InferredSlotsRangeRow[];
  specificDates: string[];
  sameTimeForAll: boolean;
  perDateTimes: Record<string, SlotsDayEditorConfig>;
};

type LocalDayPattern = {
  date: string;
  slotKind: 'HALF' | 'FULL';
  startTime: string;
  secondHalfStart: string | null;
};

function patternKey(p: {
  slotKind: string;
  startTime: string;
  secondHalfStart: string | null;
}): string {
  return `${p.slotKind}|${p.startTime}|${p.secondHalfStart ?? ''}`;
}

/** Build a local day pattern from UTC shift rows that share one calendar date. */
function dayPatternFromShifts(date: string, dayShifts: JobShiftLike[]): LocalDayPattern | null {
  const withKind = dayShifts.filter(
    (s) => s.slotKind === 'HALF' || s.slotKind === 'FULL',
  );
  if (withKind.length === 0) return null;

  const kinds = new Set(withKind.map((s) => s.slotKind));
  const slotKind: 'HALF' | 'FULL' =
    kinds.has('HALF') && !kinds.has('FULL')
      ? 'HALF'
      : kinds.has('FULL') && !kinds.has('HALF')
        ? 'FULL'
        : kinds.has('HALF')
          ? 'HALF'
          : 'FULL';

  const localStarts: string[] = [];
  for (const s of withKind) {
    if (s.slotKind !== slotKind) continue;
    const local = s.startTime
      ? utcPartsToLocalInputValues(s.date, s.startTime)?.localTime
      : null;
    if (local) localStarts.push(local);
  }
  localStarts.sort();
  if (localStarts.length === 0) return null;

  if (slotKind === 'FULL') {
    return {
      date,
      slotKind: 'FULL',
      startTime: localStarts[0],
      secondHalfStart: null,
    };
  }
  return {
    date,
    slotKind: 'HALF',
    startTime: localStarts[0],
    secondHalfStart: localStarts.length >= 2 ? localStarts[1] : null,
  };
}

function groupContiguousSamePattern(days: LocalDayPattern[]): InferredSlotsRangeRow[] {
  const out: InferredSlotsRangeRow[] = [];
  for (const d of days) {
    const prev = out[out.length - 1];
    if (
      prev &&
      nextCalendarDay(prev.endDate) === d.date &&
      patternKey(prev) === patternKey(d)
    ) {
      prev.endDate = d.date;
    } else {
      out.push({
        startDate: d.date,
        endDate: d.date,
        startTime: d.startTime,
        slotKind: d.slotKind,
        secondHalfStart: d.secondHalfStart,
      });
    }
  }
  return out;
}

function dayConfigFromPattern(d: LocalDayPattern): SlotsDayEditorConfig {
  return {
    start: d.startTime,
    slotKind: d.slotKind,
    secondHalfStart: d.secondHalfStart,
  };
}

/**
 * Reconstruct host SLOTS editor state from a job's shifts (UTC → local).
 *
 * Prefer a continuous `range` when every day is contiguous and shares the same
 * per-day slot pattern. Use `ranges` when scheduleType is RANGES. Otherwise
 * fall back to a specific-dates `list`.
 */
export function inferSlotsScheduleEditorState(
  job: JobScheduleLike | null | undefined,
): InferredSlotsScheduleEditorState {
  const empty: InferredSlotsScheduleEditorState = {
    scheduleKind: 'range',
    startDate: '',
    endDate: '',
    startTime: '',
    slotKind: '',
    secondHalfStart: null,
    dateRanges: [
      {
        startDate: '',
        endDate: '',
        startTime: '',
        slotKind: '',
        secondHalfStart: null,
      },
    ],
    specificDates: [],
    sameTimeForAll: true,
    perDateTimes: {},
  };

  const shifts = getJobShifts(job);
  if (shifts.length === 0) return empty;

  const byDate = new Map<string, JobShiftLike[]>();
  for (const s of shifts) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  const days: LocalDayPattern[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const pat = dayPatternFromShifts(date, byDate.get(date) ?? []);
    if (pat) days.push(pat);
  }
  if (days.length === 0) return empty;

  const specificDates = days.map((d) => d.date);
  const sameTimeForAll = new Set(days.map(patternKey)).size <= 1;
  const shared = days[0];
  const grouped = groupContiguousSamePattern(days);
  const perDateTimes = Object.fromEntries(
    days.map((d) => [d.date, dayConfigFromPattern(d)]),
  );

  if (getJobScheduleType(job) === 'RANGES') {
    return {
      scheduleKind: 'ranges',
      startDate: '',
      endDate: '',
      startTime: shared.startTime,
      slotKind: shared.slotKind,
      secondHalfStart: shared.secondHalfStart,
      dateRanges: grouped,
      specificDates,
      sameTimeForAll,
      perDateTimes,
    };
  }

  const isContiguousSamePattern =
    grouped.length === 1 &&
    expandIsoDateRange(grouped[0].startDate, grouped[0].endDate).length ===
      days.length;

  if (isContiguousSamePattern) {
    const g = grouped[0];
    return {
      scheduleKind: 'range',
      startDate: g.startDate,
      endDate: g.endDate,
      startTime: g.startTime,
      slotKind: g.slotKind,
      secondHalfStart: g.secondHalfStart,
      dateRanges: [g],
      specificDates,
      sameTimeForAll: true,
      perDateTimes,
    };
  }

  return {
    scheduleKind: 'list',
    startDate: '',
    endDate: '',
    startTime: shared.startTime,
    slotKind: shared.slotKind,
    secondHalfStart: shared.secondHalfStart,
    dateRanges: [
      {
        startDate: '',
        endDate: '',
        startTime: shared.startTime,
        slotKind: shared.slotKind,
        secondHalfStart: shared.secondHalfStart,
      },
    ],
    specificDates,
    sameTimeForAll,
    perDateTimes,
  };
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
  requestedShiftIds?: string[] | null;
  shiftClaims?: { shiftId: string }[] | null;
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

/** True when an application only covers part of the posting's days/slots. */
export function isPartialAvailability(app: ApplicationAvailability): boolean {
  if (app.availabilityKind !== 'PARTIAL') return false;
  if ((app.requestedShiftIds?.length ?? 0) > 0) return true;
  return Array.isArray(app.availableDates) && app.availableDates.length > 0;
}

/** Ordered SLOTS shifts with ids (empty for LEGACY / missing ids). */
export function getPostingSlots(job: JobScheduleLike | null | undefined): JobShiftLike[] {
  if (getJobScheduleModel(job) !== 'SLOTS') return [];
  return getJobShifts(job)
    .filter((s) => Boolean(s.id))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.startTime ?? '').localeCompare(b.startTime ?? '');
    });
}

/** Shift ids this application covers (claims preferred, else requested; FULL = all). */
export function applicationCoveredShiftIds(
  app: ApplicationAvailability,
  job: JobScheduleLike | null | undefined,
): string[] {
  const slots = getPostingSlots(job);
  const allIds = slots.map((s) => s.id!).filter(Boolean);
  if (allIds.length === 0) return [];

  const fromClaims = (app.shiftClaims ?? [])
    .map((c) => c.shiftId)
    .filter((id) => allIds.includes(id));
  if (fromClaims.length > 0) return [...new Set(fromClaims)];

  const requested = (app.requestedShiftIds ?? []).filter((id) => allIds.includes(id));
  if (requested.length > 0) return [...new Set(requested)];
  if (app.availabilityKind === 'FULL' || !app.availabilityKind) {
    return allIds;
  }
  if (app.availabilityKind === 'PARTIAL') {
    if ((app.availableDates?.length ?? 0) > 0) {
      const days = new Set((app.availableDates ?? []).map((d) => d.slice(0, 10)));
      return slots.filter((s) => days.has(s.date) && s.id).map((s) => s.id!);
    }
    return [];
  }
  return allIds;
}

export type DaySlotSegments = {
  date: string;
  /** One segment for FULL / single HALF; two for dual halves (earlier first). */
  segments: { shiftId: string; slotKind: 'HALF' | 'FULL'; covered: boolean; label: string }[];
};

/** Per-day segments for slotwise strip/coverage painting. */
export function getDaySlotSegments(
  job: JobScheduleLike | null | undefined,
  coveredShiftIds: Set<string> | string[],
): DaySlotSegments[] {
  const covered = coveredShiftIds instanceof Set ? coveredShiftIds : new Set(coveredShiftIds);
  const slots = getPostingSlots(job);
  if (slots.length === 0) return [];

  const byDay = new Map<string, JobShiftLike[]>();
  for (const s of slots) {
    const list = byDay.get(s.date) ?? [];
    list.push(s);
    byDay.set(s.date, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => {
      const ordered = [...daySlots].sort((a, b) =>
        (a.startTime ?? '').localeCompare(b.startTime ?? ''),
      );
      return {
        date,
        segments: ordered.map((s) => {
          const kind: 'HALF' | 'FULL' =
            s.slotKind === 'HALF' || s.slotKind === 'FULL'
              ? s.slotKind
              : 'FULL';
          const range = formatShiftTimeRange(s);
          const label =
            kind === 'HALF'
              ? `Half day${range ? ` · ${range}` : ''}`
              : `Full day${range ? ` · ${range}` : ''}`;
          return {
            shiftId: s.id!,
            slotKind: kind,
            covered: covered.has(s.id!),
            label,
          };
        }),
      };
    });
}

/** Badge counts for SLOTS: claimed / total slots. */
export function applicationSlotCoverageCounts(
  app: ApplicationAvailability,
  job: JobScheduleLike | null | undefined,
): { covered: number; total: number } | null {
  const slots = getPostingSlots(job);
  if (slots.length === 0) return null;
  const covered = applicationCoveredShiftIds(app, job);
  return { covered: covered.length, total: slots.length };
}

/** "Sep 24, 2026 · 09:00 AM - 12:30 PM" (omits time when missing). */
export function formatShiftSlotLabel(shift: JobShiftLike): string {
  const date = formatSpecificDate(shift.date);
  const range = formatShiftTimeRange(shift);
  return range ? `${date} · ${range}` : date;
}

/** Covered slot labels for an application (SLOTS only; empty otherwise). */
export function formatApplicationSlotLabels(
  app: ApplicationAvailability,
  job: JobScheduleLike | null | undefined,
  shiftIds?: string[] | null,
): string[] {
  const slots = getPostingSlots(job);
  if (slots.length === 0) return [];
  const ids =
    shiftIds != null
      ? shiftIds.filter(Boolean)
      : applicationCoveredShiftIds(app, job);
  const wanted = new Set(ids);
  return slots
    .filter((s) => s.id && wanted.has(s.id))
    .map(formatShiftSlotLabel);
}

/**
 * Partial/full badge copy: slot counts for SLOTS, day counts for LEGACY.
 * Returns null when the app is full coverage (no partial badge needed).
 */
export function applicationPartialAvailabilityBadge(
  app: ApplicationAvailability,
  job: JobScheduleLike | null | undefined,
): string | null {
  if (!isPartialAvailability(app)) return null;
  const slotCounts = applicationSlotCoverageCounts(app, job);
  if (slotCounts && slotCounts.total > 0) {
    const { covered, total } = slotCounts;
    return covered === total
      ? `Selected ${covered}/${total} slots`
      : `Partial availability ${covered}/${total} slots`;
  }
  const days = getPostingDays(job);
  if (days.length === 0) return null;
  const n = applicationCoveredDays(app, days).length;
  return n === days.length
    ? `Selected days ${n}/${days.length}`
    : `Partial availability ${n}/${days.length}`;
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
    const shifts = getJobShifts(job);
    if (getJobScheduleModel(job) === 'SLOTS' && shifts.length > 0) {
      if (shifts.length === 1) {
        const t = formatShiftTimeRange(shifts[0]);
        return t
          ? `${formatSpecificDate(shifts[0].date)} · ${t}`
          : formatSpecificDate(shifts[0].date);
      }
      const first = formatSpecificDate(shifts[0].date);
      const last = formatSpecificDate(shifts[shifts.length - 1].date);
      return `${shifts.length} total slots (${first} - ${last})`;
    }
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
