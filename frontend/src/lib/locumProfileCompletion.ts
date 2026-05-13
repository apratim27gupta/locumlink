import type { LocumProfile } from '@/types';
import { isCpsnsNineDigitsFormat } from '@/lib/cpsnsVerify';
function hasTrimmedFile(primary?: string | null, alternate?: string | null): boolean {
    const v = (primary ?? '').trim() || (alternate ?? '').trim();
    return v.length > 0;
}
export function locumProfileCompletionPct(profile: LocumProfile | null | undefined): number {
    if (!profile)
        return 0;
    const specs = profile.specialization
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const checks = [
        !!(profile.firstName ?? '').trim(),
        !!(profile.lastName ?? '').trim(),
        isCpsnsNineDigitsFormat(profile.cpsnsNumber ?? ''),
        !!(profile.professionalSummary ?? '').trim(),
        specs.length > 0,
        !!(profile.phone ?? '').trim(),
        hasTrimmedFile(profile.licenseFile, profile.licenseFileName),
        hasTrimmedFile(profile.resumeFile, profile.resumeFileName),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
}
