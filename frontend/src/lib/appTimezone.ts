/**
 * Platform display timezone.
 *
 * All on-screen dates/times are shown in Atlantic time regardless of the
 * viewer's device, and all entered times are interpreted as this zone.
 * The zone is DST-aware: AST (UTC-4) in winter, ADT (UTC-3) in summer.
 *
 * The zone is an implementation detail: never surface its name or abbreviation
 * on screen (do not pass `timeZoneName`).
 */
export const APP_TIME_ZONE = 'America/Halifax';

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

type WallParts = {
    year: number;
    month: number; // 1-12
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
};

function toDate(input: string | number | Date | null | undefined): Date | null {
    if (input == null || input === '') return null;
    const d = input instanceof Date ? input : new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Wall-clock parts of an instant in platform (Atlantic) time. */
export function astWallPartsOf(ms: number): WallParts {
    const parts = PARTS_FORMATTER.formatToParts(new Date(ms));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === type)?.value ?? '0');
    // Intl renders midnight as hour 24 under h23 on some engines; normalise.
    const rawHour = get('hour');
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hours: rawHour === 24 ? 0 : rawHour,
        minutes: get('minute'),
        seconds: get('second'),
    };
}

/** Minutes east of UTC for the platform zone at a given instant (−240 for AST, −180 for ADT). */
function zoneOffsetMinutes(ms: number): number {
    const p = astWallPartsOf(ms);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hours, p.minutes, p.seconds);
    return Math.round((asUtc - ms) / 60_000);
}

/** UTC epoch ms for an Atlantic wall-clock date/time (DST-aware). */
export function astWallToUtcMs(
    year: number,
    month: number, // 1-12
    day: number,
    hours = 0,
    minutes = 0,
    seconds = 0,
    millis = 0,
): number {
    // Treat the wall time as if it were UTC, then correct by the zone's offset
    // at that instant. One refinement pass settles DST-boundary cases.
    const guess = Date.UTC(year, month - 1, day, hours, minutes, seconds, millis);
    const off1 = zoneOffsetMinutes(guess);
    let utc = guess - off1 * 60_000;
    const off2 = zoneOffsetMinutes(utc);
    if (off2 !== off1) utc = guess - off2 * 60_000;
    return utc;
}

/** Today's calendar date (YYYY-MM-DD) in platform time. */
export function astTodayIso(now: number = Date.now()): string {
    const p = astWallPartsOf(now);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Format an instant as a date+time in platform time, e.g. "Jun 4, 2026, 9:30 AM". */
export function formatInstantDateTime(
    input: string | number | Date | null | undefined,
    locale: Intl.LocalesArgument = undefined,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
    const d = toDate(input);
    if (!d) return '—';
    return d.toLocaleString(locale, { ...options, timeZone: APP_TIME_ZONE });
}

/** Format an instant as time-of-day in platform time, e.g. "9:30 AM". */
export function formatInstantTime(
    input: string | number | Date | null | undefined,
    locale: Intl.LocalesArgument = undefined,
    options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
    const d = toDate(input);
    if (!d) return '—';
    return d.toLocaleTimeString(locale, { ...options, timeZone: APP_TIME_ZONE });
}

/** Format an instant as a calendar date in platform time. */
export function formatInstantDate(
    input: string | number | Date | null | undefined,
    locale: Intl.LocalesArgument = undefined,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
    const d = toDate(input);
    if (!d) return '—';
    return d.toLocaleDateString(locale, { ...options, timeZone: APP_TIME_ZONE });
}
