import type { CpsnsVerificationStatus } from '@/lib/cpsnsVerify';

export interface HostProfile {
    clinicName: string;
    contactFirstName: string;
    contactLastName: string;
    cpsnsNumber: string;
    cpsnsVerificationStatus?: CpsnsVerificationStatus;
    speciality: string;
    licenseFile?: string | null;
    licenseOriginalName?: string | null;
    address1: string;
    address2?: string;
    postalCode: string;
    city: string;
    province: string;
    amenities: string[];
    accommodationProvided: boolean;
    practiceType?: string;
    numPhysicians?: string;
    emr?: string;
    patientVol?: string;
    clinicDesc?: string;
}
export interface LocumProfile {
    firstName?: string;
    lastName?: string;
    cpsnsNumber?: string;
    verificationStatus?: CpsnsVerificationStatus;
    yearsOfExperience?: number | null;
    professionalSummary?: string;
    specialization?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    postalCode?: string;
    city?: string;
    province?: string;
    licenseFile?: string;
    licenseOriginalName?: string;
    resumeFile?: string;
    resumeOriginalName?: string;
    extraFile?: string;
    extraOriginalName?: string;
    licenseFileName?: string;
    resumeFileName?: string;
    extraFileName?: string;
}
