import type { LocumProfile } from '@/types';

/**
 * Locum profile **editor** (`locum-profile-page`) keeps many `useState` fields.
 * Host profile uses `useHostProfile` + one `data` object; the wizard uses a
 * single `form` + `locumApi.saveProfile(form)` like `hostApi.saveProfile(form)`.
 *
 * Here we merge split state into one object with every key as a string so
 * `JSON.stringify` does not drop fields.
 */
export function buildLocumSavePayload(
  form: Partial<LocumProfile>,
  files: { licenseFile: string; resumeFile: string; extraFile: string },
): LocumProfile {
  return {
    firstName: form.firstName ?? '',
    lastName: form.lastName ?? '',
    cpsnsNumber: form.cpsnsNumber ?? '',
    professionalSummary: form.professionalSummary ?? '',
    specialization: form.specialization ?? '',
    address1: form.address1 ?? '',
    address2: form.address2 ?? '',
    postalCode: form.postalCode ?? '',
    city: form.city ?? '',
    province: form.province ?? '',
    licenseFileName: files.licenseFile ?? '',
    resumeFileName: files.resumeFile ?? '',
    extraFileName: files.extraFile ?? '',
  };
}
