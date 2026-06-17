import { sortByLabel, sortStringsLocale } from '@/lib/sortLocale';
import {
    calendarDatePartFromInput,
    formatLocalCalendarDateForDisplay,
    isLocalPostingEndDatePassed,
    localCalendarDateToIso,
    localDateTimeToUtcParts,
    toTimezoneAwareIso,
    validateJobPostingSchedule,
    type JobScheduleValidationResult,
} from '@/lib/localDateTime';

export const HOST_JOB_CREDENTIAL_OPTIONS = sortStringsLocale([
    'CPSNS Full License',
    'CFPC Eligible',
    'CMPA coverage',
    'BLS (ACLS preferred)',
    'DEA License',
    'PALS Certified',
]);

export const JOB_TITLE_PRESET_OPTIONS = sortStringsLocale([
    'Family Physician – Walk-in Clinic',
    'Family Physician – Collaborative Practice',
    'Family Physician – Longitudinal Practice',
    'Family Physician – Long-Term Care (LTC)',
    'Family Physician – Virtual Care',
    'Family Physician – Mixed Practice',
]);

export const JOB_DESCRIPTION_PRESET_OPTIONS = sortStringsLocale([
    'Walk-in Clinic Coverage',
    'Collaborative Practice',
    'Longitudinal Practice',
    'Long-Term Care (LTC)',
    'Mixed Practice',
    'Virtual Care',
]);

export type ResponsibilitySectionDef = {
    readonly key: string;
    readonly title: string;
    readonly options: readonly {
        readonly id: string;
        readonly label: string;
    }[];
};

export const RESPONSIBILITY_SECTIONS: readonly ResponsibilitySectionDef[] = [
    {
        key: 'core',
        title: 'Core',
        options: sortByLabel([
            { id: 'scheduled', label: 'Scheduled patients' },
            { id: 'walkin', label: 'Walk-in / same-day visits' },
            { id: 'phone_virtual', label: 'Phone / virtual consults' },
            { id: 'labs', label: 'Review labs/imaging' },
            { id: 'rx', label: 'Prescription renewals' },
            { id: 'chronic', label: 'Chronic disease management' },
            { id: 'preventive', label: 'Preventive care' },
        ]),
    },
    {
        key: 'additional',
        title: 'Additional',
        options: sortByLabel([
            { id: 'ltc_rounds', label: 'Long-term care rounds' },
            { id: 'admission', label: 'Admission/discharge coordination' },
        ]),
    },
    {
        key: 'optional',
        title: 'Optional',
        options: sortByLabel([
            { id: 'supervise', label: 'Supervise learners' },
        ]),
    },
];

export const hostJobFieldInp: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #D0D5DD',
    borderRadius: 8,
    fontSize: 14,
    color: '#0B0F1F',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
};

export const hostJobFieldLbl: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
};

export type { FixedDropdownBox } from '@/lib/anchoredDropdown';
export { computeFixedDropdownBox } from '@/lib/anchoredDropdown';

export function emptyResponsibilitySelection(): Record<string, Set<string>> {
    return Object.fromEntries(RESPONSIBILITY_SECTIONS.map((s) => [s.key, new Set<string>()]));
}

export function buildResponsibilitySelection(optionIds: readonly string[]): Record<string, Set<string>> {
    const idSet = new Set(optionIds);
    return Object.fromEntries(RESPONSIBILITY_SECTIONS.map((s) => [
        s.key,
        new Set(s.options.filter((o) => idSet.has(o.id)).map((o) => o.id)),
    ]));
}

export function autoResponsibilitiesForJobTitle(title: string): Record<string, Set<string>> | null {
    const t = title.trim().toLowerCase();
    if (!t)
        return null;
    if (t.includes('walk-in') || t.includes('walk in'))
        return buildResponsibilitySelection(['walkin', 'rx']);
    if (t.includes('ltc') || t.includes('long-term care') || t.includes('long term care'))
        return buildResponsibilitySelection(['ltc_rounds', 'chronic', 'rx']);
    if (t.includes('virtual'))
        return buildResponsibilitySelection(['phone_virtual']);
    return null;
}

export function fmtIsoToMmDdYyyy(iso: string | null | undefined): string {
    if (!iso)
        return '';
    const cal = calendarDatePartFromInput(iso);
    if (cal)
        return isoToMmDdYyyy(cal);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    return isoToMmDdYyyy(localCalendarDateToIso(d));
}

/** Job schedule dates for cards/lists (no UTC off-by-one on YYYY-MM-DD). */
export function fmtJobCalendarDate(iso: string | null | undefined): string {
    return formatLocalCalendarDateForDisplay(iso);
}

/** True after the calendar end day has fully passed (user's local timezone). */
export function isPostingEndDatePassed(
    endDate: string | Date | null | undefined,
): boolean {
    return isLocalPostingEndDatePassed(endDate);
}

export function parseMmDdYyyyToIso(input: string): string {
    const t = input.trim();
    if (!t)
        return '';
    const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!m)
        return '';
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yyyy = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100)
        return '';
    const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
    return d.getFullYear() === yyyy && d.getMonth() + 1 === mm && d.getDate() === dd
        ? iso
        : '';
}

export function isoToMmDdYyyy(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
        return '';
    return `${m[2]}-${m[3]}-${m[1]}`;
}

export function formatMmDdYyyyInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2)
        return digits;
    if (digits.length <= 4)
        return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

/** Local calendar date as YYYY-MM-DD (for date input `min`). */
export function todayIsoDateLocal(): string {
    return localCalendarDateToIso();
}

export {
    getLocalNow,
    getLocalNowMs,
    getLocalTimezone,
    getLocalTimeSnapshot,
    localCalendarDateToIso,
    localDateTimeToUtcParts,
    utcPartsToLocalInputValues,
    endOfLocalCalendarDay,
    isLocalPostingEndDatePassed,
    validateJobPostingSchedule,
    toTimezoneAwareIso,
    calendarDatePartFromInput,
    compareLocalCalendarDates,
    formatLocalCalendarDateForDisplay,
    localDateFromCalendarInput,
    type JobScheduleValidationResult,
} from '@/lib/localDateTime';

/** Live validation helper — returns an error message or null when valid. */
export function getJobScheduleValidationError(params: {
    startDateIso: string;
    endDateIso: string;
    startTime: string;
    endTime: string;
    allowPastDates?: boolean;
}): string | null {
    const result = validateJobPostingSchedule(params);
    return result.valid ? null : result.message;
}

/** API schedule fields: host local date/time converted to UTC parts for storage. */
export function buildJobScheduleApiFields(params: {
    startDateIso: string;
    endDateIso: string;
    startTime: string;
    endTime: string;
}): { startDate: string; endDate: string; startTime: string; endTime: string } | null {
    const st = params.startTime.trim();
    const en = params.endTime.trim();
    if (!st || !en)
        return null;
    const start = localDateTimeToUtcParts(params.startDateIso, st);
    const end = localDateTimeToUtcParts(params.endDateIso, en);
    return {
        startDate: start.utcDate,
        endDate: end.utcDate,
        startTime: start.utcTime,
        endTime: end.utcTime,
    };
}

export function maxIsoDate(a: string, b: string): string {
    return a >= b ? a : b;
}

export function clampIsoDateToMin(iso: string, minIso: string): string {
    if (!iso || !minIso)
        return iso;
    return iso < minIso ? minIso : iso;
}

export function buildKeyResponsibilitiesPayload(respBySection: Record<string, Set<string>>, respCustom: string): string[] {
    const lines: string[] = [];
    for (const section of RESPONSIBILITY_SECTIONS) {
        const selected = respBySection[section.key] ?? new Set<string>();
        for (const opt of section.options) {
            if (!selected.has(opt.id))
                continue;
            lines.push(`${section.title}: ${opt.label}`);
        }
    }
    for (const line of respCustom
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)) {
        lines.push(line);
    }
    return lines;
}

export function parseKeyResponsibilitiesFromLines(lines: string[]): {
    respBySection: Record<string, Set<string>>;
    respCustom: string;
} {
    const respBySection = emptyResponsibilitySelection();
    const customLines: string[] = [];
    for (const raw of lines) {
        const trimmed = raw.trim();
        if (!trimmed)
            continue;
        let matched = false;
        for (const section of RESPONSIBILITY_SECTIONS) {
            const prefix = `${section.title}: `;
            if (!trimmed.startsWith(prefix))
                continue;
            const label = trimmed.slice(prefix.length);
            const opt = section.options.find((o) => o.label === label);
            if (opt) {
                respBySection[section.key].add(opt.id);
                matched = true;
                break;
            }
        }
        if (!matched)
            customLines.push(trimmed);
    }
    return { respBySection, respCustom: customLines.join('\n') };
}

export type GroupedKeyResponsibilities = {
    sections: {
        title: string;
        items: string[];
    }[];
    other: string[];
};

/** Display key responsibilities grouped by section (Core, Additional, Optional) plus custom lines under Other. */
export function groupKeyResponsibilitiesForDisplay(lines: string[]): GroupedKeyResponsibilities {
    const { respBySection, respCustom } = parseKeyResponsibilitiesFromLines(lines);
    const sections = RESPONSIBILITY_SECTIONS.map((section) => {
        const selected = respBySection[section.key] ?? new Set<string>();
        const items = section.options
            .filter((o) => selected.has(o.id))
            .map((o) => o.label);
        return { title: section.title, items };
    }).filter((s) => s.items.length > 0);
    const other = respCustom
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    return { sections, other };
}
