import { NextResponse } from 'next/server';
import { getAuthenticatedHostUserId } from '@/lib/auth-server';
import { getDb } from '@/lib/db';
import type { HostProfile } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface HostProfileRow {
  practiceName: string;
  postalCode: string;
  city: string;
  province: string;
  servicesOffered: string[];
  highlights: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  cpsnsNumber: string | null;
  speciality: string | null;
  licenseFile: string | null;
  address1: string | null;
  address2: string | null;
  accommodationProvided: boolean;
  practiceType: string | null;
  numPhysicians: string | null;
  emr: string | null;
  patientVol: string | null;
}

function combinedAddress(a1?: string, a2?: string): string {
  const s = [a1, a2].filter(Boolean).join(', ').trim();
  return s || a1 || 'Address pending';
}

function rowToApi(row: HostProfileRow): HostProfile {
  return {
    clinicName: row.practiceName,
    contactFirstName: row.contactFirstName ?? '',
    contactLastName: row.contactLastName ?? '',
    cpsnsNumber: row.cpsnsNumber ?? '',
    speciality: row.speciality ?? '',
    licenseFile: row.licenseFile ?? null,
    address1: row.address1 ?? '',
    address2: row.address2 ?? '',
    postalCode: row.postalCode,
    city: row.city,
    province: row.province,
    amenities: row.servicesOffered ?? [],
    accommodationProvided: row.accommodationProvided,
    practiceType: row.practiceType ?? '',
    numPhysicians: row.numPhysicians ?? '',
    emr: row.emr ?? '',
    patientVol: row.patientVol ?? '',
    clinicDesc: row.highlights ?? '',
  };
}

async function getUserId(req: Request): Promise<string | null> {
  return getAuthenticatedHostUserId(req);
}

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await getDb().hostProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(rowToApi(profile as unknown as HostProfileRow));
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: HostProfile;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    clinicName,
    contactFirstName,
    contactLastName,
    cpsnsNumber,
    speciality,
    licenseFile,
    address1,
    address2,
    postalCode,
    city,
    province,
    amenities,
    accommodationProvided,
    practiceType,
    numPhysicians,
    emr,
    patientVol,
    clinicDesc,
  } = body;

  const a1 = address1 ?? '';
  const a2 = address2 ?? '';

  const data = {
    practiceName: clinicName ?? '',
    address: combinedAddress(a1, a2),
    city: city ?? '',
    postalCode: postalCode ?? '',
    province: province ?? 'NS',
    servicesOffered: amenities ?? [],
    highlights: clinicDesc?.trim() ? clinicDesc : null,
    contactFirstName: contactFirstName?.trim() || null,
    contactLastName: contactLastName?.trim() || null,
    cpsnsNumber: cpsnsNumber?.trim() || null,
    speciality: speciality?.trim() || null,
    licenseFile: licenseFile ?? null,
    address1: a1 || null,
    address2: a2 || null,
    accommodationProvided: accommodationProvided ?? false,
    practiceType: practiceType?.trim() || null,
    numPhysicians: numPhysicians?.trim() || null,
    emr: emr?.trim() || null,
    patientVol: patientVol?.trim() || null,
  };

  const profile = await getDb().hostProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return NextResponse.json(rowToApi(profile as unknown as HostProfileRow));
}

export async function PUT(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<HostProfile>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const a1 = body.address1 ?? '';
  const a2 = body.address2 ?? '';

  const data = {
    ...(body.clinicName !== undefined && { practiceName: body.clinicName }),
    ...(body.address1 !== undefined && {
      address: combinedAddress(a1, a2),
      address1: a1 || null,
    }),
    ...(body.address2 !== undefined && { address2: a2 || null }),
    ...(body.city !== undefined && { city: body.city }),
    ...(body.postalCode !== undefined && { postalCode: body.postalCode }),
    ...(body.province !== undefined && { province: body.province }),
    ...(body.amenities !== undefined && { servicesOffered: body.amenities }),
    ...(body.clinicDesc !== undefined && {
      highlights: body.clinicDesc?.trim() || null,
    }),
    ...(body.contactFirstName !== undefined && {
      contactFirstName: body.contactFirstName?.trim() || null,
    }),
    ...(body.contactLastName !== undefined && {
      contactLastName: body.contactLastName?.trim() || null,
    }),
    ...(body.cpsnsNumber !== undefined && {
      cpsnsNumber: body.cpsnsNumber?.trim() || null,
    }),
    ...(body.speciality !== undefined && {
      speciality: body.speciality?.trim() || null,
    }),
    ...(body.licenseFile !== undefined && {
      licenseFile: body.licenseFile ?? null,
    }),
    ...(body.accommodationProvided !== undefined && {
      accommodationProvided: body.accommodationProvided,
    }),
    ...(body.practiceType !== undefined && {
      practiceType: body.practiceType?.trim() || null,
    }),
    ...(body.numPhysicians !== undefined && {
      numPhysicians: body.numPhysicians?.trim() || null,
    }),
    ...(body.emr !== undefined && { emr: body.emr?.trim() || null }),
    ...(body.patientVol !== undefined && {
      patientVol: body.patientVol?.trim() || null,
    }),
  };

  const profile = await getDb().hostProfile.update({
    where: { userId },
    data,
  });

  return NextResponse.json(rowToApi(profile as unknown as HostProfileRow));
}
