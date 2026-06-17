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
