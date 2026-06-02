import type { HostProfile } from '@/types';
import { hasCpsnsNumber } from '@/lib/cpsnsVerify';
type Fields = Partial<HostProfile> | null | undefined;
export function hostProfileCompletionPct(fields: Fields): number {
    if (!fields) return 0;
    const specs = fields.speciality
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

    const checks = [
        // Step 1 - Basic Info (4 fields)
        !!fields.contactFirstName,
        !!fields.contactLastName,
        hasCpsnsNumber(fields.cpsnsNumber),
        specs.length > 0,
        // Step 2 - Clinic Info (5 fields)
        !!fields.clinicName,
        !!fields.address1,
        !!fields.postalCode,
        !!fields.city,
        !!fields.province,
        // Step 3 - Practice Details (4 fields)
        !!fields.practiceType,
        !!fields.numPhysicians,
        !!fields.emr,
        !!fields.patientVol,
        // Step 4 - Services (1 field)
        (fields.amenities?.length ?? 0) > 0,
    ];

    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
}
