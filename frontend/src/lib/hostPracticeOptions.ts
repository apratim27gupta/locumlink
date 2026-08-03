import { sortByLabel, sortStringsLocale } from '@/lib/sortLocale';

export const CUSTOM_PRACTICE_TYPE = '__custom__';

export const KNOWN_PRACTICE_TYPE_VALUES = sortByLabel([
  {
    value: 'Collaborative Family Practice',
    label: 'Collaborative Family Practice',
  },
  {
    value: 'Nurse Practitioner (NP) Clinic',
    label: 'Nurse Practitioner (NP) Clinic',
  },
  { value: 'Primary Care Clinic', label: 'Primary Care Clinic' },
  {
    value: 'Traditional Fee for Service Practice',
    label: 'Traditional Fee for Service Practice',
  },
  { value: 'Virtual Care Clinic', label: 'Virtual Care Clinic' },
]);

export const JOB_AMENITY_OPTIONS = sortStringsLocale([
  'On-site Parking',
  'Digital X-Ray',
  'Laboratory services',
  'Pharmacy nearby',
  'Cafeteria',
  'Private Office Space',
  'IT Support',
  'Family Practice Nurses',
  'Social Worker',
  'Dietitian',
  'Pharmacist',
  'Administrative Support',
  'EMR Training Available',
  'Blood Collection Centre Nearby',
  'Hospital Nearby',
  'Minor Procedures',
  'Flexible Scheduling',
  'Accommodation Provided',
]);

export function splitPracticeType(value: string | null | undefined): {
  choice: string;
  custom: string;
} {
  const raw = (value ?? '').trim();
  if (!raw) return { choice: '', custom: '' };
  const known = KNOWN_PRACTICE_TYPE_VALUES.some((o) => o.value === raw);
  if (known) return { choice: raw, custom: '' };
  return { choice: CUSTOM_PRACTICE_TYPE, custom: raw };
}

export function resolvePracticeType(choice: string, custom: string): string {
  if (choice === CUSTOM_PRACTICE_TYPE) return custom.trim();
  return choice.trim();
}
