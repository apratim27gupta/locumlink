export interface HostProfile {
    clinicName: string;
    contactFirstName: string;
    contactLastName: string;
    cpsnsNumber: string;
    speciality: string;
    licenseFile?: string | null;
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
    resumeFile?: string;
    extraFile?: string;
    licenseFileName?: string;
    resumeFileName?: string;
    extraFileName?: string;
}
