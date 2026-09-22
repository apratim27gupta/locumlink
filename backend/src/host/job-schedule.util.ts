import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HALF_SLOT_HOURS,
  FULL_SLOT_HOURS,
  MAX_HOURS_PER_DAY,
  computeMatchFeeAmountCents,
  matchFeeTierFromHours,
} from '../payments/match-fee.constants.js';

export {
  HALF_SLOT_HOURS,
  FULL_SLOT_HOURS,
  MAX_HOURS_PER_DAY,
  computeMatchFeeAmountCents,
  matchFeeTierFromHours,
};

const DEFAULT_PLATFORM_TIMEZONE = 'America/Halifax';

/** IANA zone for interpreting stored calendar date + clock time (from PLATFORM_TIMEZONE env). */
export function getPlatformTimezone(): string {
  const tz = process.env.PLATFORM_TIMEZONE?.trim();
  return tz && tz.length > 0 ? tz : DEFAULT_PLATFORM_TIMEZONE;
}

/** YYYY-MM-DD from date-only or ISO string (calendar day as written, not UTC-shifted). */
export function extractCalendarDatePart(
  value: string | null | undefined,
): string | null {
  const t = value?.trim() ?? '';
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Store @db.Date as UTC midnight of the calendar day (stable across zones). */
export function parseCalendarDateForDb(value: string): Date {
  const cal = extractCalendarDatePart(value);
  if (!cal) {
    throw new BadRequestException('Invalid date format.');
  }
  const [y, mo, d] = cal.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(dt.getTime())) {
    throw new BadRequestException('Invalid date.');
  }
  return dt;
}

/** Serialize Prisma DATE for API consumers as YYYY-MM-DD. */
export function formatCalendarDateForApi(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const cal = extractCalendarDatePart(value);
    return cal;
  }
  if (Number.isNaN(value.getTime())) return null;
  const y = value.getUTCFullYear();
  const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function hasTimezoneOffset(iso: string): boolean {
  return /([+-]\d{2}:\d{2}|Z)$/i.test(iso.trim());
}

/**
 * Parse schedule instant from ISO 8601 (must include offset or Z).
 * Uses the offset embedded in the timestamp — never assumes UTC or a fixed zone.
 */
export function parseScheduleInstantMs(
  isoWithOffset: string,
  label: string,
): number {
  const trimmed = isoWithOffset.trim();
  if (!trimmed.includes('T')) {
    throw new BadRequestException(
      `${label} must be sent as a timezone-aware ISO 8601 timestamp.`,
    );
  }
  if (!hasTimezoneOffset(trimmed)) {
    throw new BadRequestException(
      `${label} must include a timezone offset (e.g. -04:00).`,
    );
  }
  const ms = new Date(trimmed).getTime();
  if (Number.isNaN(ms)) {
    throw new BadRequestException(`Invalid ${label}.`);
  }
  return ms;
}

export function assertJobScheduleAcceptable(params: {
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** Skip "in the past" checks for drafts. */
  allowPast?: boolean;
}): { startDate?: Date; endDate?: Date } {
  const startRaw = params.startDate?.trim() ?? '';
  const endRaw = params.endDate?.trim() ?? '';
  const hasStart = startRaw.length > 0;
  const hasEnd = endRaw.length > 0;

  if (!hasStart && !hasEnd) {
    return {};
  }

  let startDb: Date | undefined;
  let endDb: Date | undefined;

  if (hasStart) {
    startDb = parseCalendarDateForDb(startRaw);
  }
  if (hasEnd) {
    endDb = parseCalendarDateForDb(endRaw);
  }

  if (startDb && endDb && endDb.getTime() < startDb.getTime()) {
    throw new BadRequestException(
      'End date must be on or after the start date.',
    );
  }

  const startHasInstant = startRaw.includes('T');
  const endHasInstant = endRaw.includes('T');
  const hasClockTimes =
    Boolean(params.startTime?.trim()) && Boolean(params.endTime?.trim());

  if (!params.allowPast && hasStart && startHasInstant) {
    const startMs = parseScheduleInstantMs(startRaw, 'Start date');
    if (startMs < Date.now()) {
      throw new BadRequestException(
        'Start date and time cannot be in the past.',
      );
    }
  }

  if (hasStart && hasEnd && startHasInstant && endHasInstant) {
    const startMs = parseScheduleInstantMs(startRaw, 'Start date');
    const endMs = parseScheduleInstantMs(endRaw, 'End date');
    if (endMs <= startMs) {
      throw new BadRequestException('End time must be after start time.');
    }
  } else if (hasStart && hasEnd && hasClockTimes && !startHasInstant && !endHasInstant) {
    const startMs = utcDateTimePartsToMs(startRaw, params.startTime!);
    const endMs = utcDateTimePartsToMs(endRaw, params.endTime!);
    if (startMs != null && endMs != null && endMs <= startMs) {
      throw new BadRequestException('End time must be after start time.');
    }
  }

  if (!params.allowPast && hasStart && hasClockTimes && !startHasInstant) {
    const startMs = utcDateTimePartsToMs(startRaw, params.startTime!);
    if (startMs != null && startMs < Date.now()) {
      throw new BadRequestException(
        'Start date and time cannot be in the past.',
      );
    }
  }

  return {
    ...(startDb != null && { startDate: startDb }),
    ...(endDb != null && { endDate: endDb }),
  };
}

/**
 * Validate a set of individually chosen locum dates (YYYY-MM-DD each).
 * Returns the de-duplicated dates as @db.Date values (UTC midnight, ascending)
 * plus the derived start/end span (min/max) so the existing range-based status,
 * expiry, browse and notification logic keeps working unchanged.
 */
export function parseJobDates(
  dates: string[],
  opts: { allowPast?: boolean } = {},
): { dates: Date[]; startDate: Date; endDate: Date } {
  const byIso = new Map<string, Date>();
  for (const raw of dates) {
    const cal = extractCalendarDatePart(raw);
    if (!cal) {
      throw new BadRequestException('Invalid date format.');
    }
    if (!byIso.has(cal)) {
      byIso.set(cal, parseCalendarDateForDb(cal));
    }
  }

  const parsed = [...byIso.values()].sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  if (parsed.length === 0) {
    throw new BadRequestException('At least one date is required.');
  }

  if (!opts.allowPast) {
    // A chosen day is in the past once it (and its whole day) has elapsed.
    const earliest = parsed[0];
    const endOfEarliestDay = Date.UTC(
      earliest.getUTCFullYear(),
      earliest.getUTCMonth(),
      earliest.getUTCDate(),
      23,
      59,
      59,
      999,
    );
    if (endOfEarliestDay < Date.now()) {
      throw new BadRequestException('Dates cannot be in the past.');
    }
  }

  return {
    dates: parsed,
    startDate: parsed[0],
    endDate: parsed[parsed.length - 1],
  };
}

/** HH:mm (UTC) -> a Date suitable for a Prisma @db.Time column (1970-01-01 UTC). */
export function clockTimeToDbTime(
  time: string | null | undefined,
): Date | null {
  const tm = parseClockTimeHm(time);
  if (!tm) return null;
  return new Date(Date.UTC(1970, 0, 1, tm.hours, tm.minutes, 0, 0));
}

/** Prisma @db.Time value (Date at 1970-01-01 UTC) -> "HH:mm" (UTC). */
export function dbTimeToClockString(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export type JobShiftInput = {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
};

export type SlotKind = 'HALF' | 'FULL';

export type JobSlotShiftInput = {
  date: string;
  startTime: string;
  slotKind: SlotKind;
};

export type ParsedJobShift = {
  date: Date;
  startTime: string | null;
  endTime: string | null;
  /** Present for SLOTS postings. */
  shiftType?: 'HALF_DAY' | 'FULL_DAY';
  slotKind?: SlotKind;
  hours?: number;
};

/** Add fractional hours to HH:mm; clamps to same calendar day (max 23:59). */
export function addClockHours(startHm: string, hours: number): string {
  const tm = parseClockTimeHm(startHm);
  if (!tm) {
    throw new BadRequestException('Invalid start time.');
  }
  const totalMinutes = Math.round(tm.hours * 60 + tm.minutes + hours * 60);
  if (totalMinutes < 0) {
    throw new BadRequestException('Computed end time is invalid.');
  }
  if (totalMinutes > 23 * 60 + 59) {
    throw new BadRequestException(
      'Slot end time must fall on the same calendar day. Choose an earlier start time.',
    );
  }
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Hours for a ShiftType used on SLOTS rows (and legacy AM/PM half aliases). */
export function slotHoursFromShiftType(
  shiftType: string | null | undefined,
): number {
  switch (shiftType) {
    case 'HALF_DAY':
    case 'HALF_DAY_AM':
    case 'HALF_DAY_PM':
      return HALF_SLOT_HOURS;
    case 'FULL_DAY':
    default:
      return FULL_SLOT_HOURS;
  }
}

export function hoursBetweenClockTimes(
  startHm: string | null | undefined,
  endHm: string | null | undefined,
): number | null {
  const a = parseClockTimeHm(startHm);
  const b = parseClockTimeHm(endHm);
  if (!a || !b) return null;
  const startM = a.hours * 60 + a.minutes;
  const endM = b.hours * 60 + b.minutes;
  if (endM <= startM) return null;
  return (endM - startM) / 60;
}

/**
 * Validate a set of individually chosen shifts, each with its own optional
 * start/end time. De-duplicates by calendar day (last entry wins), sorts
 * ascending, and derives:
 *  - startDate / endDate: the min/max day (so range-based status & expiry work)
 *  - startTime / endTime: the earliest day's start and latest day's end, kept as
 *    the posting-level fallback for reminders, browse filters and emails that
 *    still assume one time per posting.
 */
export function parseJobShifts(
  shifts: JobShiftInput[],
  opts: { allowPast?: boolean } = {},
): {
  shifts: ParsedJobShift[];
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
} {
  const byIso = new Map<string, ParsedJobShift>();
  for (const raw of shifts) {
    const cal = extractCalendarDatePart(raw?.date);
    if (!cal) {
      throw new BadRequestException('Invalid date format.');
    }
    const startTime = raw.startTime?.trim() ? raw.startTime.trim() : null;
    const endTime = raw.endTime?.trim() ? raw.endTime.trim() : null;
    if (startTime && !parseClockTimeHm(startTime)) {
      throw new BadRequestException('Invalid start time.');
    }
    if (endTime && !parseClockTimeHm(endTime)) {
      throw new BadRequestException('Invalid end time.');
    }
    // Last entry for a given day wins.
    byIso.set(cal, {
      date: parseCalendarDateForDb(cal),
      startTime,
      endTime,
    });
  }

  const parsed = [...byIso.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  if (parsed.length === 0) {
    throw new BadRequestException('At least one date is required.');
  }

  if (!opts.allowPast) {
    const earliest = parsed[0].date;
    const endOfEarliestDay = Date.UTC(
      earliest.getUTCFullYear(),
      earliest.getUTCMonth(),
      earliest.getUTCDate(),
      23,
      59,
      59,
      999,
    );
    if (endOfEarliestDay < Date.now()) {
      throw new BadRequestException('Dates cannot be in the past.');
    }
  }

  return {
    shifts: parsed,
    startDate: parsed[0].date,
    endDate: parsed[parsed.length - 1].date,
    startTime: parsed[0].startTime,
    endTime: parsed[parsed.length - 1].endTime,
  };
}

/**
 * Validate SLOTS schedule: per day either 1 full (7h) or 1–2 halves (3.5h each),
 * total <= 7h. End time is computed from start + slot kind.
 */
export function parseJobShiftsSlots(
  shifts: JobSlotShiftInput[],
  opts: { allowPast?: boolean } = {},
): {
  shifts: ParsedJobShift[];
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
} {
  if (!Array.isArray(shifts) || shifts.length === 0) {
    throw new BadRequestException('At least one date is required.');
  }

  type DaySlot = {
    cal: string;
    date: Date;
    startTime: string;
    slotKind: SlotKind;
    hours: number;
    endTime: string;
    shiftType: 'HALF_DAY' | 'FULL_DAY';
  };

  const byDay = new Map<string, DaySlot[]>();

  for (const raw of shifts) {
    const cal = extractCalendarDatePart(raw?.date);
    if (!cal) {
      throw new BadRequestException('Invalid date format.');
    }
    const startTime = raw.startTime?.trim() ?? '';
    if (!parseClockTimeHm(startTime)) {
      throw new BadRequestException('Start time is required for each slot.');
    }
    const kind = (raw.slotKind ?? '').toString().toUpperCase();
    if (kind !== 'HALF' && kind !== 'FULL') {
      throw new BadRequestException('Each slot must be HALF or FULL.');
    }
    const slotKind = kind as SlotKind;
    const hours = slotKind === 'HALF' ? HALF_SLOT_HOURS : FULL_SLOT_HOURS;
    const endTime = addClockHours(startTime, hours);
    const entry: DaySlot = {
      cal,
      date: parseCalendarDateForDb(cal),
      startTime,
      slotKind,
      hours,
      endTime,
      shiftType: slotKind === 'HALF' ? 'HALF_DAY' : 'FULL_DAY',
    };
    const list = byDay.get(cal) ?? [];
    list.push(entry);
    byDay.set(cal, list);
  }

  for (const [cal, daySlots] of byDay) {
    const halfCount = daySlots.filter((s) => s.slotKind === 'HALF').length;
    const fullCount = daySlots.filter((s) => s.slotKind === 'FULL').length;
    if (fullCount > 0 && halfCount > 0) {
      throw new BadRequestException(
        `Day ${cal}: use either one full-day slot or half-day slots, not both.`,
      );
    }
    if (fullCount > 1) {
      throw new BadRequestException(
        `Day ${cal}: only one full-day slot is allowed.`,
      );
    }
    if (halfCount > 2) {
      throw new BadRequestException(
        `Day ${cal}: at most two half-day slots are allowed.`,
      );
    }
    if (fullCount === 0 && halfCount === 0) {
      throw new BadRequestException(`Day ${cal}: at least one slot is required.`);
    }
    const totalHours = daySlots.reduce((sum, s) => sum + s.hours, 0);
    if (totalHours > MAX_HOURS_PER_DAY + 1e-9) {
      throw new BadRequestException(
        `Day ${cal}: total hours cannot exceed ${MAX_HOURS_PER_DAY}.`,
      );
    }
    // Overlap check within the day.
    const intervals = daySlots
      .map((s) => {
        const a = parseClockTimeHm(s.startTime)!;
        const b = parseClockTimeHm(s.endTime)!;
        return {
          start: a.hours * 60 + a.minutes,
          end: b.hours * 60 + b.minutes,
        };
      })
      .sort((x, y) => x.start - y.start);
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start < intervals[i - 1].end) {
        throw new BadRequestException(
          `Day ${cal}: half-day slots must not overlap.`,
        );
      }
    }
  }

  const parsed: ParsedJobShift[] = [...byDay.values()]
    .flat()
    .sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime();
      if (d !== 0) return d;
      return a.startTime.localeCompare(b.startTime);
    })
    .map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      shiftType: s.shiftType,
      slotKind: s.slotKind,
      hours: s.hours,
    }));

  if (!opts.allowPast) {
    const earliest = parsed[0].date;
    const endOfEarliestDay = Date.UTC(
      earliest.getUTCFullYear(),
      earliest.getUTCMonth(),
      earliest.getUTCDate(),
      23,
      59,
      59,
      999,
    );
    if (endOfEarliestDay < Date.now()) {
      throw new BadRequestException('Dates cannot be in the past.');
    }
  }

  return {
    shifts: parsed,
    startDate: parsed[0].date,
    endDate: parsed[parsed.length - 1].date,
    startTime: parsed[0].startTime,
    endTime: parsed[parsed.length - 1].endTime,
  };
}

/** Inclusive list of YYYY-MM-DD from two @db.Date values (UTC components); capped. */
export function expandCalendarDateRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
): string[] {
  if (!start || !end) return [];
  let cur = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (Number.isNaN(cur) || Number.isNaN(last) || last < cur) return [];
  const out: string[] = [];
  for (let i = 0; cur <= last && i < 400; i++) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
  }
  return out;
}

export type PostingDaysSource = {
  startDate?: Date | null;
  endDate?: Date | null;
  startTime?: string | null;
  endTime?: string | null;
  scheduleModel?: string | null;
  shifts?:
    | {
        id?: string;
        date: Date;
        shiftType?: string | null;
        startTime?: Date | string | null;
        endTime?: Date | string | null;
      }[]
    | null;
};

export type ShiftClaimSource = {
  shiftId: string;
};

export type CoverageApplicationWithClaims = CoverageApplication & {
  shiftClaims?: ShiftClaimSource[] | null;
  /** Requested shift IDs before finalize (apply payload). */
  requestedShiftIds?: string[] | null;
};

/**
 * The set of calendar days a posting needs covered (sorted, unique, YYYY-MM-DD):
 * shift dates when the posting has shifts (DATES/RANGES), otherwise the days
 * spanned by the continuous start/end range.
 */
export function getPostingRequiredDates(posting: PostingDaysSource): string[] {
  const shifts = posting.shifts ?? [];
  const days = shifts.length
    ? shifts
        .map((s) => formatCalendarDateForApi(s.date))
        .filter((d): d is string => d != null)
    : expandCalendarDateRange(posting.startDate ?? null, posting.endDate ?? null);
  return [...new Set(days)].sort();
}

export type CoverageApplication = {
  availabilityKind?: string | null;
  availableDates?: string[] | null;
};

/**
 * Days one application claims against the posting schedule. FULL (or missing
 * PARTIAL dates) claims every required day; PARTIAL claims availableDates ∩ required.
 */
export function applicationClaimedDates(
  app: CoverageApplication,
  requiredDates: string[],
): string[] {
  const required = new Set(requiredDates);
  const isPartial =
    app.availabilityKind === 'PARTIAL' &&
    Array.isArray(app.availableDates) &&
    app.availableDates.length > 0;
  if (!isPartial) return [...requiredDates].sort();
  const out = new Set<string>();
  for (const d of app.availableDates as string[]) {
    const cal = extractCalendarDatePart(d);
    if (cal && required.has(cal)) out.add(cal);
  }
  return [...out].sort();
}

/**
 * Days covered by the given (accepted) applications. A FULL application covers
 * every required day; a PARTIAL one covers its availableDates intersected with
 * the required set. Anything without PARTIAL + dates is treated as FULL.
 */
export function computeCoveredDates(
  apps: CoverageApplication[],
  requiredDates: string[],
): Set<string> {
  const covered = new Set<string>();
  for (const app of apps) {
    for (const d of applicationClaimedDates(app, requiredDates)) {
      covered.add(d);
    }
  }
  return covered;
}

/**
 * Days the accepting locum is finalized for: their claim minus days already
 * taken by earlier acceptances (first to accept wins overlapping days).
 */
export function finalizeAcceptDates(
  app: CoverageApplication,
  requiredDates: string[],
  alreadyAcceptedApps: CoverageApplication[],
): string[] {
  const taken = computeCoveredDates(alreadyAcceptedApps, requiredDates);
  return applicationClaimedDates(app, requiredDates).filter((d) => !taken.has(d));
}

/** Persist shape after accept: FULL only when every required day is kept and locum chose FULL. */
export function availabilityAfterFinalize(
  requiredDates: string[],
  finalizedDates: string[],
  priorKind?: string | null,
): { availabilityKind: 'FULL' | 'PARTIAL'; availableDates: string[] } {
  const sortedFinal = [...finalizedDates].sort();
  if (priorKind === 'PARTIAL') {
    return { availabilityKind: 'PARTIAL', availableDates: sortedFinal };
  }
  const all =
    requiredDates.length > 0 &&
    requiredDates.length === sortedFinal.length &&
    requiredDates.every((d) => sortedFinal.includes(d));
  if (all) return { availabilityKind: 'FULL', availableDates: [] };
  return { availabilityKind: 'PARTIAL', availableDates: sortedFinal };
}

function postingShiftIds(posting: PostingDaysSource): string[] {
  return (posting.shifts ?? [])
    .map((s) => s.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Shift IDs an application claims (explicit claims, requested IDs, or all for FULL). */
export function applicationClaimedShiftIds(
  app: CoverageApplicationWithClaims,
  posting: PostingDaysSource,
): string[] {
  const allIds = postingShiftIds(posting);
  const allSet = new Set(allIds);
  const fromClaims = (app.shiftClaims ?? [])
    .map((c) => c.shiftId)
    .filter((id) => allSet.has(id));
  if (fromClaims.length > 0) return [...new Set(fromClaims)].sort();

  const requested = (app.requestedShiftIds ?? []).filter((id) => allSet.has(id));
  if (requested.length > 0) return [...new Set(requested)].sort();

  // Day-based partial without shift IDs: map days → all shifts on those days.
  const requiredDates = getPostingRequiredDates(posting);
  const claimedDays = new Set(applicationClaimedDates(app, requiredDates));
  if (
    app.availabilityKind === 'PARTIAL' &&
    Array.isArray(app.availableDates) &&
    app.availableDates.length > 0
  ) {
    const out: string[] = [];
    for (const s of posting.shifts ?? []) {
      if (!s.id) continue;
      const cal = formatCalendarDateForApi(s.date);
      if (cal && claimedDays.has(cal)) out.push(s.id);
    }
    return [...new Set(out)].sort();
  }

  // FULL (or no partial dates): every shift.
  return [...allIds].sort();
}

export function computeCoveredShiftIds(
  apps: CoverageApplicationWithClaims[],
  posting: PostingDaysSource,
): Set<string> {
  const covered = new Set<string>();
  for (const app of apps) {
    for (const id of applicationClaimedShiftIds(app, posting)) {
      covered.add(id);
    }
  }
  return covered;
}

/** First-accept-wins per shift ID. */
export function finalizeAcceptShiftIds(
  app: CoverageApplicationWithClaims,
  posting: PostingDaysSource,
  alreadyAcceptedApps: CoverageApplicationWithClaims[],
): string[] {
  const taken = computeCoveredShiftIds(alreadyAcceptedApps, posting);
  return applicationClaimedShiftIds(app, posting).filter((id) => !taken.has(id));
}

function clockFromShiftTime(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const hm = parseClockTimeHm(value);
    if (hm) {
      return `${String(hm.hours).padStart(2, '0')}:${String(hm.minutes).padStart(2, '0')}`;
    }
    return dbTimeToClockString(value);
  }
  return dbTimeToClockString(value);
}

/** Hours for one shift row (SLOTS type or legacy clock span). */
export function hoursForShiftRow(shift: {
  shiftType?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
}): number {
  const start = clockFromShiftTime(shift.startTime);
  const end = clockFromShiftTime(shift.endTime);
  const fromClock = hoursBetweenClockTimes(start, end);
  if (fromClock != null && fromClock > 0) return fromClock;
  return slotHoursFromShiftType(shift.shiftType);
}

/**
 * Total hours claimed by an application for match-fee tiering.
 * SLOTS: sum claimed shift hours. LEGACY: sum per claimed day from shift/posting times.
 */
export function computeApplicationClaimedHours(
  posting: PostingDaysSource,
  app: CoverageApplicationWithClaims,
): number {
  const shifts = posting.shifts ?? [];
  const isSlots = posting.scheduleModel === 'SLOTS';

  if (isSlots && shifts.some((s) => s.id)) {
    const claimedIds = new Set(applicationClaimedShiftIds(app, posting));
    let total = 0;
    for (const s of shifts) {
      if (s.id && claimedIds.has(s.id)) {
        total += hoursForShiftRow(s);
      }
    }
    return Math.round(total * 100) / 100;
  }

  // LEGACY (or SLOTS without shift ids): sum hours for claimed calendar days.
  const requiredDates = getPostingRequiredDates(posting);
  const claimedDays = applicationClaimedDates(app, requiredDates);
  if (claimedDays.length === 0) return 0;

  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const cal = formatCalendarDateForApi(s.date);
    if (!cal) continue;
    const list = byDay.get(cal) ?? [];
    list.push(s);
    byDay.set(cal, list);
  }

  let total = 0;
  for (const day of claimedDays) {
    const dayShifts = byDay.get(day);
    if (dayShifts && dayShifts.length > 0) {
      for (const s of dayShifts) {
        const start = clockFromShiftTime(s.startTime);
        const end = clockFromShiftTime(s.endTime);
        const fromClock = hoursBetweenClockTimes(start, end);
        if (fromClock != null && fromClock > 0) {
          total += fromClock;
        } else if (s.shiftType) {
          total += slotHoursFromShiftType(s.shiftType);
        } else {
          const fromPosting = hoursBetweenClockTimes(
            posting.startTime ?? null,
            posting.endTime ?? null,
          );
          total +=
            fromPosting != null && fromPosting > 0
              ? fromPosting
              : FULL_SLOT_HOURS;
        }
      }
    } else {
      const fromPosting = hoursBetweenClockTimes(
        posting.startTime ?? null,
        posting.endTime ?? null,
      );
      total += fromPosting != null && fromPosting > 0 ? fromPosting : FULL_SLOT_HOURS;
    }
  }
  return Math.round(total * 100) / 100;
}

/** True when every required day is covered by the given accepted applications. */
export function isPostingFullyCovered(
  posting: PostingDaysSource,
  acceptedApps: CoverageApplicationWithClaims[],
): boolean {
  if (posting.scheduleModel === 'SLOTS') {
    const requiredShiftIds = postingShiftIds(posting);
    if (requiredShiftIds.length > 0) {
      const covered = computeCoveredShiftIds(acceptedApps, posting);
      return requiredShiftIds.every((id) => covered.has(id));
    }
  }

  const required = getPostingRequiredDates(posting);
  if (required.length === 0) {
    // No discrete schedule: fall back to legacy "any accepted" behaviour.
    return acceptedApps.length > 0;
  }
  const covered = computeCoveredDates(acceptedApps, required);
  return required.every((d) => covered.has(d));
}

/** True after the stored calendar end day (UTC date components) has fully passed. */
export function isPostingEndDatePassed(
  endDate: Date | null | undefined,
): boolean {
  if (!endDate) return false;
  if (Number.isNaN(endDate.getTime())) return false;
  const y = endDate.getUTCFullYear();
  const mo = endDate.getUTCMonth();
  const d = endDate.getUTCDate();
  const endOfStoredDay = Date.UTC(y, mo, d, 23, 59, 59, 999);
  return endOfStoredDay < Date.now();
}

/** True once the stored calendar start day (UTC) has begun (or there is no start date). */
export function isPostingStartDateReached(
  startDate: Date | null | undefined,
): boolean {
  if (!startDate) return true;
  if (Number.isNaN(startDate.getTime())) return true;
  const y = startDate.getUTCFullYear();
  const mo = startDate.getUTCMonth();
  const d = startDate.getUTCDate();
  const startOfStoredDay = Date.UTC(y, mo, d, 0, 0, 0, 0);
  return startOfStoredDay <= Date.now();
}

/**
 * Status after a locum accepts: COMPLETED if end passed, ONGOING if in/after start,
 * otherwise SCHEDULED (filled upcoming — applies blocked).
 */
export function postingStatusAfterLocumAccept(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): 'SCHEDULED' | 'ONGOING' | 'COMPLETED' {
  if (isPostingEndDatePassed(endDate)) return 'COMPLETED';
  if (isPostingStartDateReached(startDate)) return 'ONGOING';
  return 'SCHEDULED';
}

/** Combine stored UTC calendar date + HH:mm into epoch ms. */
export function utcDateTimePartsToMs(
  dateStr: string,
  timeStr: string,
): number | null {
  const cal = extractCalendarDatePart(dateStr);
  const tm = parseClockTimeHm(timeStr);
  if (!cal || !tm) return null;
  const [y, mo, d] = cal.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, tm.hours, tm.minutes, 0, 0);
}

/** Parse HH:mm (24h) from a stored start_time / end_time varchar. */
export function parseClockTimeHm(
  time: string | null | undefined,
): { hours: number; minutes: number } | null {
  const m = time?.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * PostgreSQL: shift start (start_date + start_time stored as UTC) is still in the future.
 * Used for locum browse queries and expiry cron (single source of truth).
 */
export function browseShiftStartActiveSql(): Prisma.Sql {
  return Prisma.sql`(
    start_date IS NULL
    OR (
      start_date::timestamp
      + COALESCE(
          NULLIF(
            substring(COALESCE(start_time, '') FROM '^([0-9]{1,2}:[0-9]{2})'),
            ''
          )::time,
          TIME '23:59:59'
        )
    ) > NOW()
  )`;
}
