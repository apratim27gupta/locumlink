import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Specialty,
  type LocumProfile as LocumProfileRow,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { isCpsnsVerified } from '../cpsns/cpsns-verified.js';
import type { SaveLocumProfileDto } from './locum.dto.js';

function mapSpecialty(raw?: string): Specialty {
  if (!raw?.trim()) return Specialty.OTHER;
  const key = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return (Specialty as Record<string, Specialty>)[key] ?? Specialty.OTHER;
}

function specialtyToDisplay(s: Specialty): string {
  const labels: Record<Specialty, string> = {
    [Specialty.GENERAL_PRACTICE]: 'General Practice',
    [Specialty.INTERNAL_MEDICINE]: 'Internal Medicine',
    [Specialty.PEDIATRICS]: 'Paediatrics',
    [Specialty.PSYCHIATRY]: 'Psychiatry',
    [Specialty.EMERGENCY_MEDICINE]: 'Emergency Medicine',
    [Specialty.SURGERY]: 'Surgery',
    [Specialty.OBSTETRICS_GYNECOLOGY]: 'Obstetrics & Gynecology',
    [Specialty.ANESTHESIOLOGY]: 'Anaesthesiology',
    [Specialty.RADIOLOGY]: 'Radiology',
    [Specialty.OTHER]: 'Other',
  };
  return labels[s] ?? 'Other';
}

/** API shape expected by the Next.js locum profile UI */
export type LocumProfileApi = {
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
  licenseFile?: string;
  resumeFile?: string;
  extraFile?: string;
};

function parseSaveBody(body: Record<string, unknown>): SaveLocumProfileDto {
  const s = (k: string) => {
    const v = body[k];
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      typeof v === 'bigint'
    )
      return String(v).trim();
    return '';
  };
  return {
    firstName: s('firstName'),
    lastName: s('lastName'),
    cpsnsNumber: s('cpsnsNumber') || undefined,
    professionalSummary: s('professionalSummary') || undefined,
    specialization: s('specialization') || undefined,
    address1: s('address1') || undefined,
    address2: s('address2') || undefined,
    postalCode: s('postalCode') || undefined,
    city: s('city') || undefined,
    province: s('province') || undefined,
    licenseFileName: s('licenseFileName') || undefined,
    resumeFileName: s('resumeFileName') || undefined,
    extraFileName: s('extraFileName') || undefined,
  };
}

@Injectable()
export class LocumService {
  constructor(private readonly prisma: PrismaService) {}

  private mapProfileToApi(profile: LocumProfileRow): LocumProfileApi {
    const spec =
      profile.specializationText?.trim() ||
      specialtyToDisplay(profile.specialty);
    return {
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      cpsnsNumber: profile.cpsnsId,
      professionalSummary: profile.summary ?? undefined,
      specialization: spec,
      address1: profile.address1 ?? undefined,
      address2: profile.address2 ?? undefined,
      postalCode: profile.postalCode ?? undefined,
      city: profile.city ?? undefined,
      province: profile.province ?? undefined,
      licenseFile: profile.licenseFileName ?? undefined,
      resumeFile: profile.resumeFileName ?? undefined,
      extraFile: profile.extraFileName ?? undefined,
    };
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async saveProfile(userId: string, body: Record<string, unknown>) {
    const dto = parseSaveBody(body);
    const trimmedCpsns = dto.cpsnsNumber?.trim();
    const pendingFallback = `pending-${userId}`;

    if (trimmedCpsns) {
      const taken = await this.prisma.locumProfile.findFirst({
        where: { cpsnsId: trimmedCpsns, userId: { not: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new BadRequestException(
          'This CPSNS number is already registered to another account.',
        );
      }
    }

    const cpsnsId = trimmedCpsns || pendingFallback;
    const specialty = mapSpecialty(dto.specialization);
    const summary = dto.professionalSummary?.trim() || null;
    const specializationText = dto.specialization?.trim() || null;

    const profile = await this.prisma.locumProfile.upsert({
      where: { userId },
      create: {
        userId,
        cpsnsId,
        specialty,
        summary,
        firstName: dto.firstName,
        lastName: dto.lastName,
        specializationText,
        address1: dto.address1?.trim() || null,
        address2: dto.address2?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
        city: dto.city?.trim() || null,
        province: dto.province?.trim() || null,
        licenseFileName: dto.licenseFileName?.trim() || null,
        resumeFileName: dto.resumeFileName?.trim() || null,
        extraFileName: dto.extraFileName?.trim() || null,
      },
      update: {
        ...(trimmedCpsns ? { cpsnsId: trimmedCpsns } : {}),
        specialty,
        summary,
        firstName: dto.firstName,
        lastName: dto.lastName,
        specializationText,
        address1: dto.address1?.trim() ?? null,
        address2: dto.address2?.trim() ?? null,
        postalCode: dto.postalCode?.trim() ?? null,
        city: dto.city?.trim() ?? null,
        province: dto.province?.trim() ?? null,
        licenseFileName: dto.licenseFileName?.trim() ?? null,
        resumeFileName: dto.resumeFileName?.trim() ?? null,
        extraFileName: dto.extraFileName?.trim() ?? null,
      },
    });
    return { success: true, profile: this.mapProfileToApi(profile) };
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.locumProfile.findUnique({
      where: { userId },
    });
    return {
      exists: !!profile,
      profile: profile ? this.mapProfileToApi(profile) : null,
    };
  }

  // ── Browse active jobs ────────────────────────────────────────────────────

  async browseJobs() {
    const jobs = await this.prisma.jobPosting.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        hostProfile: {
          select: {
            practiceName: true,
            city: true,
            province: true,
            address: true,
            address1: true,
            practiceType: true,
            emr: true,
            servicesOffered: true,
            highlights: true,
          },
        },
        _count: { select: { applications: true } },
      },
    });

    return {
      jobs: jobs.map((j) => ({
        ...j,
        applicationsCount: j._count.applications,
      })),
    };
  }

  // ── Apply to a job ─────────────────────────────────────────────────────────

  async applyToJob(userId: string, jobId: string, coverNote?: string) {
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true, cpsnsId: true },
    });
    if (!locumProfile)
      throw new NotFoundException(
        'Complete your profile before applying to jobs.',
      );
    if (!isCpsnsVerified(locumProfile.cpsnsId)) {
      throw new BadRequestException(
        'Your CPSNS number must be on the verified list before you can apply to jobs.',
      );
    }

    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found.');
    if (job.status !== 'ACTIVE')
      throw new BadRequestException(
        'This job is no longer accepting applications.',
      );

    const existing = await this.prisma.application.findFirst({
      where: { jobPostingId: jobId, locumProfileId: locumProfile.id },
    });
    if (existing)
      throw new BadRequestException('You have already applied to this job.');

    const application = await this.prisma.application.create({
      data: {
        jobPostingId: jobId,
        locumProfileId: locumProfile.id,
        status: 'APPLIED',
        coverNote: coverNote ?? null,
      },
    });

    return { success: true, application };
  }

  // ── My applications ───────────────────────────────────────────────────────

  async getMyApplications(userId: string) {
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!locumProfile) return { applications: [] };

    const applications = await this.prisma.application.findMany({
      where: { locumProfileId: locumProfile.id },
      orderBy: { appliedAt: 'desc' },
      include: {
        jobPosting: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
            startTime: true,
            endTime: true,
            hostProfile: {
              select: {
                userId: true,
                practiceName: true,
                city: true,
                province: true,
              },
            },
          },
        },
      },
    });

    return { applications };
  }
}
