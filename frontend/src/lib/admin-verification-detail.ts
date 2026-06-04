import type { PrismaClient } from '@prisma/client';
import { signGcsPath } from '@/lib/gcs-sign-server';
import { formatAdminCpsnsDisplay } from '@/lib/cpsnsVerify';

export type AdminVerificationDocument = {
  id: string;
  label: string;
  fileName: string;
  signedUrl: string;
};

export type AdminProfileField = {
  label: string;
  value: string;
};

function cpsnsProfileField(value: string | null | undefined): AdminProfileField {
  return { label: 'CPSNS', value: formatAdminCpsnsDisplay(value) };
}

async function buildDocument(
  id: string,
  label: string,
  storagePath: string | null | undefined,
  displayName: string | null | undefined,
): Promise<AdminVerificationDocument | null> {
  const path = storagePath?.trim();
  if (!path) return null;
  const fileName =
    displayName?.trim()
    || path.split('/').pop()
    || label;
  const signedUrl = await signGcsPath(path);
  return { id, label, fileName, signedUrl };
}

function field(label: string, value: unknown): AdminProfileField | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return { label, value: s };
}

export async function fetchLocumVerificationDetail(
  db: PrismaClient,
  id: string,
) {
  const profile = await db.locumProfile.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      documents: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!profile) return null;

  const docCandidates = await Promise.all([
    buildDocument('license', 'CPSNS License', profile.licenseFileName, profile.licenseOriginalName),
    buildDocument('resume', 'CV / Resume', profile.resumeFileName, profile.resumeOriginalName),
    buildDocument('extra', 'Additional documents', profile.extraFileName, profile.extraOriginalName),
  ]);
  const documents = docCandidates.filter((d): d is AdminVerificationDocument => d !== null);

  const profileFields = [
    field('Email', profile.user.email),
    field('First name', profile.firstName),
    field('Last name', profile.lastName),
    cpsnsProfileField(profile.cpsnsId),
    field('Specialty', profile.specializationText ?? profile.specialty),
    field('Years of experience', profile.yearsOfExperience),
    field('Address', [profile.address1, profile.address2].filter(Boolean).join(', ')),
    field('City', profile.city),
    field('Province', profile.province),
    field('Postal code', profile.postalCode),
    field('Professional summary', profile.summary),
    field('Verification status', profile.cpsnsVerificationStatus),
  ].filter((f): f is AdminProfileField => f !== null);

  return {
    profileType: 'locum' as const,
    documents,
    profileFields,
  };
}

export async function fetchHostVerificationDetail(
  db: PrismaClient,
  id: string,
) {
  const profile = await db.hostProfile.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!profile) return null;

  const docCandidates = await Promise.all([
    buildDocument(
      'license',
      'CPSNS License',
      profile.licenseFile,
      profile.licenseOriginalName,
    ),
    buildDocument(
      'photo-id',
      'Photo ID',
      profile.photoIdFile,
      profile.photoIdOriginalName,
    ),
  ]);
  const documents = docCandidates.filter((d): d is AdminVerificationDocument => d !== null);

  const profileFields = [
    field('Email', profile.user.email),
    field('Clinic / practice', profile.practiceName),
    field('Contact', [profile.contactFirstName, profile.contactLastName].filter(Boolean).join(' ')),
    cpsnsProfileField(profile.cpsnsNumber),
    field('Speciality', profile.speciality),
    field('Address', profile.address1 ?? profile.address),
    field('Address line 2', profile.address2),
    field('City', profile.city),
    field('Province', profile.province),
    field('Postal code', profile.postalCode),
    field('Practice type', profile.practiceType),
    field('Physicians on site', profile.numPhysicians),
    field('EMR', profile.emr),
    field('Patient volume', profile.patientVol),
    field('Services', profile.servicesOffered?.join(', ')),
    field('Accommodation provided', profile.accommodationProvided ? 'Yes' : 'No'),
    field('Clinic description', profile.highlights),
    field('Verification status', profile.cpsnsVerificationStatus),
  ].filter((f): f is AdminProfileField => f !== null);

  return {
    profileType: 'host' as const,
    documents,
    profileFields,
  };
}

export type AdminVerificationDetail =
  | NonNullable<Awaited<ReturnType<typeof fetchLocumVerificationDetail>>>
  | NonNullable<Awaited<ReturnType<typeof fetchHostVerificationDetail>>>;

/** Which table owns this profile id (tries hint table first). */
export async function resolveVerificationProfileType(
  db: PrismaClient,
  id: string,
  hint?: 'locum' | 'host',
): Promise<'locum' | 'host' | null> {
  const order: ('locum' | 'host')[] =
    hint === 'host'
      ? ['host', 'locum']
      : hint === 'locum'
        ? ['locum', 'host']
        : ['locum', 'host'];

  for (const profileType of order) {
    const row =
      profileType === 'host'
        ? await db.hostProfile.findUnique({ where: { id }, select: { id: true } })
        : await db.locumProfile.findUnique({ where: { id }, select: { id: true } });
    if (row) return profileType;
  }
  return null;
}

/** Resolve by profile id; tries preferred table first, then the other. */
export async function fetchVerificationDetailById(
  db: PrismaClient,
  id: string,
  preferred?: 'locum' | 'host',
): Promise<AdminVerificationDetail | null> {
  const order: ('locum' | 'host')[] =
    preferred === 'host'
      ? ['host', 'locum']
      : preferred === 'locum'
        ? ['locum', 'host']
        : ['locum', 'host'];

  for (const profileType of order) {
    const detail =
      profileType === 'host'
        ? await fetchHostVerificationDetail(db, id)
        : await fetchLocumVerificationDetail(db, id);
    if (detail) return detail;
  }
  return null;
}

export type AdminUserProfileDetail = AdminVerificationDetail & {
  userId: string;
  email: string;
  role: 'LOCUM' | 'HOST';
  hasProfile: boolean;
};

/** Load CPSNS, profile fields, and signed document URLs for a user account. */
export async function fetchUserProfileDetailByUserId(
  db: PrismaClient,
  userId: string,
): Promise<AdminUserProfileDetail | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      locumProfile: { select: { id: true } },
      hostProfile: { select: { id: true } },
    },
  });
  if (!user || user.role === 'ADMIN') return null;

  if (user.role === 'HOST' && user.hostProfile) {
    const detail = await fetchHostVerificationDetail(db, user.hostProfile.id);
    if (detail) {
      return {
        ...detail,
        userId: user.id,
        email: user.email,
        role: 'HOST',
        hasProfile: true,
      };
    }
  }

  if (user.role === 'LOCUM' && user.locumProfile) {
    const detail = await fetchLocumVerificationDetail(db, user.locumProfile.id);
    if (detail) {
      return {
        ...detail,
        userId: user.id,
        email: user.email,
        role: 'LOCUM',
        hasProfile: true,
      };
    }
  }

  const profileType = user.role === 'HOST' ? ('host' as const) : ('locum' as const);
  const profileFields = [
    field('Email', user.email),
    field('Account status', user.status),
    field('Role', user.role === 'HOST' ? 'Host Physician' : 'Locum Physician'),
  ].filter((f): f is AdminProfileField => f !== null);

  return {
    profileType,
    documents: [],
    profileFields,
    userId: user.id,
    email: user.email,
    role: user.role === 'HOST' ? 'HOST' : 'LOCUM',
    hasProfile: false,
  };
}
