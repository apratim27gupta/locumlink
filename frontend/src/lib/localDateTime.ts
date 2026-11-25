/**
 * Local date/time from the user's device (browser uses OS timezone).
 * Use these helpers instead of UTC-only APIs for posting schedules and expiry UI.
 */
import {
    astTodayIso,
    astWallPartsOf,
    astWallToUtcMs,
} from './appTimezone';

/** Current instant on the user's machine. */
export function getLocalNow(): Date {
    return new Date();
}

export function getLocalNowMs(): number {
    return Date.now();
}

/** IANA timezone from the browser/OS, e.g. "America/Toronto" or "Asia/Kolkata". */
export function getLocalTimezone(): string {
    try {
        const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
        return timeZone ?? '';
    }
    catch {
        return '';
    }
}

/** Calendar date YYYY-MM-DD in local timezone. */
export function localCalendarDateToIso(d: Date = getLocalNow()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Last moment of a local calendar day from YYYY-MM-DD. */
export function endOfLocalCalendarDay(isoDate: string): Date | null {
    const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
        return null;
    const end = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        23,
        59,
        59,
        999,
    );
    return Number.isNaN(end.getTime()) ? null : end;
}

/** Last moment (23:59:59.999 AST) of a calendar day, as UTC epoch ms. */
function astEndOfCalendarDayMs(isoDate: string): number {
    const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return Number.NaN;
    return astWallToUtcMs(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        23,
        59,
        59,
        999,
    );
}

/** Start of a local calendar day from YYYY-MM-DD. */
export function startOfLocalCalendarDay(isoDate: string): Date | null {
    const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
        return null;
    const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    return Number.isNaN(start.getTime()) ? null : start;
}

/**
 * True after the full local calendar end day has passed.
 * Accepts YYYY-MM-DD or any Date/ISO string (mapped to local calendar day).
 */
export function isLocalPostingEndDatePassed(
    endDate: string | Date | null | undefined,
): boolean {
    if (endDate == null || endDate === '')
        return false;
    if (typeof endDate === 'string') {
        const raw = endDate.trim();
        const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
        if (iso) {
            return astEndOfCalendarDayMs(iso) < getLocalNowMs();
        }
    }
    const d = new Date(endDate as string | Date);
    if (Number.isNaN(d.getTime()))
        return false;
    return astEndOfCalendarDayMs(localCalendarDateToIso(d)) < getLocalNowMs();
}

/**
 * True when the combined shift start (local calendar date + HH:mm) is in the past.
 * Postings with no start date are never considered passed.
 * When startTime is missing, uses 23:59 on that day (visible for the full day).
 */
export function isLocalPostingStartDateTimePassed(
    startDate: string | Date | null | undefined,
    startTime?: string | null,
): boolean {
    if (startDate == null || startDate === '')
        return false;

    let dateIso: string | null;
    if (typeof startDate === 'string') {
        dateIso = calendarDatePartFromInput(startDate);
        if (!dateIso) {
            const d = new Date(startDate);
            if (Number.isNaN(d.getTime()))
                return false;
            dateIso = localCalendarDateToIso(d);
        }
    }
    else {
        if (Number.isNaN(startDate.getTime()))
            return false;
        dateIso = localCalendarDateToIso(startDate);
    }

    const timeForCombine = startTime?.trim()
        ? startTime
        : '23:59';
    const dm = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const tm = parseLocalTimeHm(timeForCombine);
    if (!dm || !tm)
        return false;
    const shiftStartMs = astWallToUtcMs(
        Number(dm[1]),
        Number(dm[2]),
        Number(dm[3]),
        tm.hours,
        tm.minutes,
    );
    return shiftStartMs < getLocalNowMs();
}

/** Compare local calendar days only (YYYY-MM-DD). */
export function compareLocalCalendarDates(a: string, b: string): number {
    return a.localeCompare(b);
}

const DEFAULT_DISPLAY_DATE_OPTS: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
};

/**
 * Format a calendar date for UI without UTC shift.
 * `new Date('2026-06-04')` is UTC midnight and can show as the previous local day.
 */
export function formatLocalCalendarDateForDisplay(
    input: string | Date | null | undefined,
    locale: string | Intl.LocalesArgument = 'en-US',
    options: Intl.DateTimeFormatOptions = DEFAULT_DISPLAY_DATE_OPTS,
): string {
    if (input == null || input === '')
        return '';
    if (input instanceof Date) {
        if (Number.isNaN(input.getTime()))
            return '';
        const day = startOfLocalCalendarDay(localCalendarDateToIso(input));
        return day ? day.toLocaleDateString(locale, options) : '';
    }
    const cal = calendarDatePartFromInput(input);
    if (cal) {
        const day = startOfLocalCalendarDay(cal);
        if (day)
            return day.toLocaleDateString(locale, options);
    }
    const d = new Date(input);
    if (Number.isNaN(d.getTime()))
        return '';
    return d.toLocaleDateString(locale, options);
}

/** Start of the local calendar day from API date fields (YYYY-MM-DD or ISO). */
export function localDateFromCalendarInput(
    input: string | null | undefined,
): Date | null {
    if (input == null || input === '')
        return null;
    const cal = calendarDatePartFromInput(input);
    if (cal)
        return startOfLocalCalendarDay(cal);
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
}

export type LocalTimeSnapshot = {
    nowMs: number;
    timezone: string;
    calendarDateIso: string;
    offsetMinutes: number;
};

/** Snapshot of desktop local time for logging or API headers. */
export function getLocalTimeSnapshot(): LocalTimeSnapshot {
    const now = getLocalNow();
    return {
        nowMs: now.getTime(),
        timezone: getLocalTimezone(),
        calendarDateIso: localCalendarDateToIso(now),
        offsetMinutes: -now.getTimezoneOffset(),
    };
}

/** YYYY-MM-DD prefix from an ISO or date-only string (authoritative calendar day). */
export function calendarDatePartFromInput(
    input: string | null | undefined,
): string | null {
    const t = input?.trim() ?? '';
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Parse HH:mm (24h) from a time input. */
export function parseLocalTimeHm(
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
 * Combine a local calendar date (YYYY-MM-DD) and optional HH:mm into a Date
 * in the user's browser timezone (native Date local components).
 */
export function localDateTimeFromCalendarAndTime(
    dateIso: string,
    timeHm?: string | null,
): Date | null {
    const day = startOfLocalCalendarDay(dateIso);
    if (!day) return null;
    const tm = parseLocalTimeHm(timeHm);
    if (!tm) return day;
    return new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        tm.hours,
        tm.minutes,
        0,
        0,
    );
}

/**
 * ISO 8601 instant in platform time (AST, UTC-4), e.g. 2026-06-04T09:30:00-04:00.
 * Use when sending schedule fields to the API.
 */
/**
 * Convert entered date + time (interpreted in platform time, AST/UTC-4) to UTC
 * date/time parts for API storage.
 */
export function localDateTimeToUtcParts(
    localDateStr: string,
    localTimeStr: string,
): { utcDate: string; utcTime: string } {
    const dm = localDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    const tm = parseLocalTimeHm(localTimeStr);
    if (!dm || !tm) {
        // Fall back to a direct parse so callers still get a value.
        const d = new Date(`${localDateStr}T${localTimeStr}:00`);
        return {
            utcDate: d.toISOString().split('T')[0],
            utcTime: d.toISOString().split('T')[1].slice(0, 5),
        };
    }
    const ms = astWallToUtcMs(
        Number(dm[1]),
        Number(dm[2]),
        Number(dm[3]),
        tm.hours,
        tm.minutes,
    );
    const iso = new Date(ms).toISOString();
    return { utcDate: iso.split('T')[0], utcTime: iso.split('T')[1].slice(0, 5) };
}

/**
 * Convert stored UTC date/time parts to platform-time (AST) values for form
 * inputs, so a time shows and re-saves in the same zone it is displayed in.
 */
export function utcPartsToLocalInputValues(
    utcDateStr: string | null | undefined,
    utcTimeStr: string | null | undefined,
): { localDate: string; localTime: string } | null {
    if (!utcDateStr) return null;
    const time = utcTimeStr?.trim() ? utcTimeStr : '00:00';
    const d = new Date(`${utcDateStr.split('T')[0]}T${time}:00Z`);
    if (isNaN(d.getTime())) return null;
    const p = astWallPartsOf(d.getTime());
    const localDate = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    const localTime = `${String(p.hours).padStart(2, '0')}:${String(p.minutes).padStart(2, '0')}`;
    return { localDate, localTime };
}

export function toTimezoneAwareIso(
    dateIso: string,
    timeHm?: string | null,
): string | null {
    const dm = dateIso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dm) return null;
    const tm = parseLocalTimeHm(timeHm);
    // Entered wall time is platform (Atlantic) time; resolve to the actual
    // instant so the DST-correct offset (AST -04:00 or ADT -03:00) is attached.
    const utcMs = astWallToUtcMs(
        Number(dm[1]),
        Number(dm[2]),
        Number(dm[3]),
        tm ? tm.hours : 0,
        tm ? tm.minutes : 0,
    );
    return new Date(utcMs).toISOString();
}

export type JobScheduleValidationResult =
    | { valid: true }
    | { valid: false; message: string };

/** Validate job posting dates/times against the user's local clock. */
export function validateJobPostingSchedule(params: {
    startDateIso: string;
    endDateIso: string;
    startTime: string;
    endTime: string;
    /** When true, only checks ordering — not "in the past" (draft save). */
    allowPastDates?: boolean;
}): JobScheduleValidationResult {
    const today = astTodayIso();
    const { startDateIso, endDateIso, startTime, endTime, allowPastDates } =
        params;

    if (!startDateIso) {
        return { valid: false, message: 'Start date is required.' };
    }
    if (!endDateIso) {
        return { valid: false, message: 'End date is required.' };
    }
    if (!allowPastDates) {
        if (compareLocalCalendarDates(startDateIso, today) < 0) {
            return { valid: false, message: 'Start date cannot be in the past.' };
        }
        if (compareLocalCalendarDates(endDateIso, today) < 0) {
            return { valid: false, message: 'End date cannot be in the past.' };
        }
    }
    if (compareLocalCalendarDates(endDateIso, startDateIso) < 0) {
        return {
            valid: false,
            message: 'End date must be on or after start date.',
        };
    }

    if (!startTime?.trim()) {
        return { valid: false, message: 'Start time is required.' };
    }
    if (!endTime?.trim()) {
        return { valid: false, message: 'End time is required.' };
    }
    if (!parseLocalTimeHm(startTime)) {
        return { valid: false, message: 'Start time is invalid.' };
    }
    if (!parseLocalTimeHm(endTime)) {
        return { valid: false, message: 'End time is invalid.' };
    }

    const startDm = startDateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endDm = endDateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const startTm = parseLocalTimeHm(startTime);
    const endTm = parseLocalTimeHm(endTime);
    if (!startDm || !endDm || !startTm || !endTm) {
        return { valid: false, message: 'Schedule dates are invalid.' };
    }
    const startMs = astWallToUtcMs(
        Number(startDm[1]), Number(startDm[2]), Number(startDm[3]), startTm.hours, startTm.minutes,
    );
    const endMs = astWallToUtcMs(
        Number(endDm[1]), Number(endDm[2]), Number(endDm[3]), endTm.hours, endTm.minutes,
    );

    if (!allowPastDates && startMs < getLocalNowMs()) {
        return {
            valid: false,
            message: 'Start date and time cannot be in the past.',
        };
    }
    if (endMs <= startMs) {
        return {
            valid: false,
            message: 'End time must be after start time.',
        };
    }

    return { valid: true };
}
