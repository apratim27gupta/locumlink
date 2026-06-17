/**
 * Local date/time from the user's device (browser uses OS timezone).
 * Use these helpers instead of UTC-only APIs for posting schedules and expiry UI.
 */

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
            const end = endOfLocalCalendarDay(iso);
            return end != null && end.getTime() < getLocalNowMs();
        }
    }
    const d = new Date(endDate as string | Date);
    if (Number.isNaN(d.getTime()))
        return false;
    const end = endOfLocalCalendarDay(localCalendarDateToIso(d));
    return end != null && end.getTime() < getLocalNowMs();
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
    const shiftStart = localDateTimeFromCalendarAndTime(dateIso, timeForCombine);
    if (!shiftStart)
        return false;
    return shiftStart.getTime() < getLocalNowMs();
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

function formatLocalOffsetForDate(d: Date): string {
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const oh = String(Math.floor(abs / 60)).padStart(2, '0');
    const om = String(abs % 60).padStart(2, '0');
    return `${sign}${oh}:${om}`;
}

/**
 * ISO 8601 instant with the browser's local offset, e.g. 2026-06-04T09:30:00-04:00.
 * Use when sending schedule fields to the API.
 */
/** Convert local browser date + time to UTC date/time parts for API storage. */
export function localDateTimeToUtcParts(
    localDateStr: string,
    localTimeStr: string,
): { utcDate: string; utcTime: string } {
    const localIso = `${localDateStr}T${localTimeStr}:00`;
    const d = new Date(localIso);
    const utcDate = d.toISOString().split('T')[0];
    const utcTime = d.toISOString().split('T')[1].slice(0, 5);
    return { utcDate, utcTime };
}

/** Convert stored UTC date/time parts to local values for form inputs. */
export function utcPartsToLocalInputValues(
    utcDateStr: string | null | undefined,
    utcTimeStr: string | null | undefined,
): { localDate: string; localTime: string } | null {
    if (!utcDateStr) return null;
    const time = utcTimeStr?.trim() ? utcTimeStr : '00:00';
    const d = new Date(`${utcDateStr.split('T')[0]}T${time}:00Z`);
    if (isNaN(d.getTime())) return null;
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const localTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { localDate, localTime };
}

export function toTimezoneAwareIso(
    dateIso: string,
    timeHm?: string | null,
): string | null {
    const dt = localDateTimeFromCalendarAndTime(dateIso, timeHm);
    if (!dt) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    const cal = localCalendarDateToIso(dt);
    return `${cal}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00${formatLocalOffsetForDate(dt)}`;
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
    const today = localCalendarDateToIso();
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

    const startDt = localDateTimeFromCalendarAndTime(startDateIso, startTime);
    const endDt = localDateTimeFromCalendarAndTime(endDateIso, endTime);
    if (!startDt || !endDt) {
        return { valid: false, message: 'Schedule dates are invalid.' };
    }

    if (!allowPastDates && startDt.getTime() < getLocalNowMs()) {
        return {
            valid: false,
            message: 'Start date and time cannot be in the past.',
        };
    }
    if (endDt.getTime() <= startDt.getTime()) {
        return {
            valid: false,
            message: 'End time must be after start time.',
        };
    }

    return { valid: true };
}
