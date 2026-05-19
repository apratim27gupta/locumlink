import citiesRaw from '@/data/cities.json';

export type CanadianCityRow = {
    name: string;
    province: string;
};

export const CANADIAN_CITY_ROWS: CanadianCityRow[] = (citiesRaw as [
    string,
    string
][]).map(([name, province]) => ({ name, province }));

/** Prefix index (first two letters) to avoid scanning ~7k rows on every keystroke. */
const PREFIX_BUCKET = new Map<string, CanadianCityRow[]>();
for (const row of CANADIAN_CITY_ROWS) {
    const key = row.name.toLowerCase().slice(0, 2);
    const bucket = PREFIX_BUCKET.get(key);
    if (bucket)
        bucket.push(row);
    else
        PREFIX_BUCKET.set(key, [row]);
}

export const CANADIAN_PROVINCE_NAMES: Record<string, string> = {
    AB: 'Alberta',
    BC: 'British Columbia',
    MB: 'Manitoba',
    NB: 'New Brunswick',
    NL: 'Newfoundland & Labrador',
    NS: 'Nova Scotia',
    NT: 'Northwest Territories',
    NU: 'Nunavut',
    ON: 'Ontario',
    PE: 'Prince Edward Island',
    QC: 'Quebec',
    SK: 'Saskatchewan',
    YT: 'Yukon',
};

function bucketForQuery(query: string): CanadianCityRow[] {
    const lower = query.trim().toLowerCase();
    if (lower.length < 2)
        return [];
    const key = lower.slice(0, 2);
    const bucket = PREFIX_BUCKET.get(key);
    if (bucket)
        return bucket;
    if (lower.length === 2)
        return [];
    const out: CanadianCityRow[] = [];
    for (const [prefix, rows] of PREFIX_BUCKET) {
        if (prefix.startsWith(lower) || lower.startsWith(prefix))
            out.push(...rows);
    }
    return out;
}

export function filterCanadianCities(query: string, limit = 8): CanadianCityRow[] {
    if (!query || query.trim().length < 2)
        return [];
    const lower = query.trim().toLowerCase();
    const scan = bucketForQuery(lower);
    let found = scan.filter((c) => c.name.toLowerCase().startsWith(lower)).slice(0, limit);
    if (found.length < 4) {
        const keys = new Set(found.map((c) => `${c.name}|${c.province}`));
        const extra = scan
            .filter((c) => !keys.has(`${c.name}|${c.province}`) && c.name.toLowerCase().includes(lower))
            .slice(0, limit - found.length);
        found = [...found, ...extra];
    }
    return found.slice(0, limit);
}

export function formatCanadianCityDisplay(name: string): string {
    const t = name.trim();
    if (!t)
        return '';
    const lower = t.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}
