import type { CpsnsVerificationStatus } from '@/lib/cpsnsVerify';

export type HostAccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface HostProfile {
    clinicName: string;
    contactFirstName: string;
    contactLastName: string;
    cpsnsNumber: string;
    cpsnsVerificationStatus?: CpsnsVerificationStatus;
    rejectionReason?: string | null;
    rejectedAt?: string | null;
    accountStatus?: HostAccountStatus;
    suspensionNote?: string | null;
    suspendedAt?: string | null;
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
export type LocumAccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface LocumProfile {
    firstName?: string;
    lastName?: string;
    cpsnsNumber?: string;
    cpsnsVerificationStatus?: CpsnsVerificationStatus;
    rejectionReason?: string | null;
    rejectedAt?: string | null;
    accountStatus?: LocumAccountStatus;
    suspensionNote?: string | null;
    suspendedAt?: string | null;
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
