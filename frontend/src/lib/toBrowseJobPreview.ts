import type { BrowseJob, Job } from '@/lib/api';
import type { HostProfile } from '@/types';

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Maps a host-owned job + profile into the locum browse shape for preview.
 */
export function toBrowseJobPreview(
  job: Job,
  profile: HostProfile | null,
): BrowseJob {
  const addressFromParts = [profile?.address1, profile?.address2]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');

  const location =
    asNullableString(job.location) ??
    ([profile?.city, profile?.province].filter(Boolean).join(', ') || '');

  return {
    id: job.id,
    title: job.title,
    description: job.description ?? '',
    location,
    createdAt:
      asNullableString(job.createdAt) ??
      asNullableString(job.updatedAt) ??
      new Date().toISOString(),
    applicationsCount: job.applicationsCount ?? 0,
    hostProfile: {
      practiceName: profile?.clinicName?.trim() || '',
      contactFirstName: profile?.contactFirstName ?? null,
      contactLastName: profile?.contactLastName ?? null,
      cpsnsVerificationStatus: profile?.cpsnsVerificationStatus ?? null,
      city: profile?.city?.trim() || '',
      province: profile?.province?.trim() || '',
      postalCode: profile?.postalCode?.trim() || undefined,
      address: addressFromParts || null,
      address1: profile?.address1?.trim() || null,
      practiceType: profile?.practiceType?.trim() || null,
      emr: profile?.emr?.trim() || null,
      servicesOffered: Array.isArray(profile?.amenities)
        ? profile.amenities
        : [],
      highlights: profile?.clinicDesc?.trim() || null,
    },
    startDate: asNullableString(job.startDate),
    endDate: asNullableString(job.endDate),
    startTime: asNullableString(job.startTime),
    endTime: asNullableString(job.endTime),
    payPerDay: job.payPerDay ?? null,
    requiredCredentials: asStringArray(job.requiredCredentials),
    keyResponsibilities: asStringArray(job.keyResponsibilities),
    minYearsExperience: asNullableNumber(job.minYearsExperience),
    isRural: Boolean(job.isRural),
    accommodationProvided: Boolean(job.accommodationProvided),
    isDeleted: job.isDeleted === true,
  };
}
