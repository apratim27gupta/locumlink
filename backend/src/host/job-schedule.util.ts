import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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

export type ParsedJobShift = {
  date: Date;
  startTime: string | null;
  endTime: string | null;
};

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
  shifts?: { date: Date }[] | null;
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

/** Persist shape after accept: FULL only when every required day is kept. */
export function availabilityAfterFinalize(
  requiredDates: string[],
  finalizedDates: string[],
): { availabilityKind: 'FULL' | 'PARTIAL'; availableDates: string[] } {
  const all =
    requiredDates.length > 0 &&
    requiredDates.length === finalizedDates.length &&
    requiredDates.every((d) => finalizedDates.includes(d));
  if (all) return { availabilityKind: 'FULL', availableDates: [] };
  return { availabilityKind: 'PARTIAL', availableDates: [...finalizedDates].sort() };
}

/** True when every required day is covered by the given accepted applications. */
export function isPostingFullyCovered(
  posting: PostingDaysSource,
  acceptedApps: CoverageApplication[],
): boolean {
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
