import type { LocumProfile } from '@/types';
export function buildLocumSavePayload(form: Partial<LocumProfile>, files: {
    licenseFile: string;
    resumeFile: string;
    extraFile: string;
    licenseOriginalName?: string;
    resumeOriginalName?: string;
    extraOriginalName?: string;
}): LocumProfile {
    return {
        firstName: form.firstName ?? '',
        lastName: form.lastName ?? '',
        cpsnsNumber: form.cpsnsNumber ?? '',
        msiProviderNumber: form.msiProviderNumber ?? '',
        yearsOfExperience: form.yearsOfExperience === undefined ? null : form.yearsOfExperience,
        professionalSummary: form.professionalSummary ?? '',
        specialization: form.specialization ?? '',
        phone: form.phone ?? '',
        fax: form.fax ?? '',
        address1: form.address1 ?? '',
        address2: form.address2 ?? '',
        postalCode: form.postalCode ?? '',
        city: form.city ?? '',
        province: form.province ?? '',
        practiceAddress1: form.practiceAddress1 ?? '',
        practiceAddress2: form.practiceAddress2 ?? '',
        practicePostalCode: form.practicePostalCode ?? '',
        practiceCity: form.practiceCity ?? '',
        practiceProvince: form.practiceProvince ?? '',
        licenseFileName: files.licenseFile ?? '',
        licenseOriginalName: files.licenseOriginalName ?? '',
        resumeFileName: files.resumeFile ?? '',
        resumeOriginalName: files.resumeOriginalName ?? '',
        extraFileName: files.extraFile ?? '',
        extraOriginalName: files.extraOriginalName ?? '',
    };
}
