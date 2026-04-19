// ─── HostProfile ─────────────────────────────────────────────────────────────
// This matches exactly what host-profile-setup.tsx collects (3 steps)
// plus the extra fields editable only on the profile page.

export interface HostProfile {
  // Step 1 — Basic Info
  clinicName: string;
  contactFirstName: string;
  contactLastName: string;
  cpsnsNumber: string;
  speciality: string; // comma-separated, e.g. "Family Physician, ENT"
  licenseFile?: string | null; // filename of uploaded CPSNS licence doc

  // Step 2 — Clinic Location
  address1: string;
  address2?: string;
  postalCode: string;
  city: string;
  province: string;

  // Step 3 — Services (setup) / Practice Details (profile page only)
  amenities: string[];
  accommodationProvided: boolean;

  // Profile-page-only fields
  practiceType?: string;
  numPhysicians?: string;
  emr?: string;
  patientVol?: string;
  clinicDesc?: string;
}

// ─── LocumProfile (frontend shape; backend may return Prisma fields) ─────────

export interface LocumProfile {
  firstName?: string;
  lastName?: string;
  cpsnsNumber?: string;
  professionalSummary?: string;
  specialization?: string;
  address1?: string;
  address2?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  /** Stored file names from GET /profile (display). */
  licenseFile?: string;
  resumeFile?: string;
  extraFile?: string;
  /** Sent on POST /profile (same as backend DTO). */
  licenseFileName?: string;
  resumeFileName?: string;
  extraFileName?: string;
}
