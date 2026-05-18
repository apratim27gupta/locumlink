import type { HostProfile } from '@/types';
import { isCpsnsNineDigitsFormat } from '@/lib/cpsnsVerify';
type Fields = Partial<HostProfile> | null | undefined;
export function hostProfileCompletionPct(fields: Fields): number {
    if (!fields)
        return 0;
    const specs = fields.speciality
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const step1Complete = !!(
        fields.contactFirstName &&
        fields.contactLastName &&
        isCpsnsNineDigitsFormat(fields.cpsnsNumber) &&
        specs.length
    );
    const step2Complete = !!(
        fields.clinicName &&
        fields.address1 &&
        fields.postalCode &&
        fields.city &&
        fields.province
    );
    const step3Complete = !!(fields.practiceType &&
        fields.numPhysicians &&
        fields.emr &&
        fields.patientVol);
    const step4Complete = (fields.amenities?.length ?? 0) > 0;
    const completedCount = [
        step1Complete,
        step2Complete,
        step3Complete,
        step4Complete,
    ].filter(Boolean).length;
    return Math.round((completedCount / 4) * 100);
}
