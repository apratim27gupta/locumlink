import { Injectable, NotFoundException, BadRequestException, ForbiddenException, } from '@nestjs/common';
import {
    DocumentType,
    Specialty,
    UserStatus,
    VerificationStatus,
    type LocumProfile as LocumProfileRow,
    type User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
    isCpsnsVerificationApproved,
    normalizeCpsns,
    credentialReviewPatchOnProfileSave,
} from '../cpsns/cpsns-verified.js';
import type { SaveLocumProfileDto } from './locum.dto.js';
function mapSpecialty(raw?: string): Specialty {
    if (!raw?.trim())
        return Specialty.OTHER;
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
export type LocumProfileApi = {
    firstName?: string;
    lastName?: string;
    cpsnsNumber?: string;
    yearsOfExperience?: number | null;
    professionalSummary?: string;
    specialization?: string;
    address1?: string;
    address2?: string;
    postalCode?: string;
    city?: string;
    province?: string;
    phone?: string;
    licenseFile?: string;
    licenseOriginalName?: string;
    resumeFile?: string;
    resumeOriginalName?: string;
    extraFile?: string;
    extraOriginalName?: string;
    cpsnsVerificationStatus?: VerificationStatus;
    rejectionReason: string | null;
    rejectedAt: string | null;
    accountStatus: UserStatus;
    suspensionNote: string | null;
    suspendedAt: string | null;
};
function parseSaveBody(body: Record<string, unknown>): SaveLocumProfileDto {
    const s = (k: string) => {
        const v = body[k];
        if (v === null || v === undefined)
            return '';
        if (typeof v === 'string')
            return v.trim();
        if (typeof v === 'number' ||
            typeof v === 'boolean' ||
            typeof v === 'bigint')
            return String(v).trim();
        return '';
    };
    const n = (k: string): number | undefined => {
        const raw = body[k];
        if (raw === null || raw === undefined)
            return undefined;
        if (typeof raw === 'number')
            return Number.isFinite(raw) ? raw : undefined;
        const str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
        if (!str)
            return undefined;
        const parsed = Number(str);
        if (!Number.isFinite(parsed))
            return undefined;
        const int = Math.trunc(parsed);
        if (int < 0)
            return undefined;
        return int;
    };
    return {
        firstName: s('firstName'),
        lastName: s('lastName'),
        cpsnsNumber: s('cpsnsNumber') || undefined,
        yearsOfExperience: n('yearsOfExperience'),
        professionalSummary: s('professionalSummary') || undefined,
        specialization: s('specialization') || undefined,
        address1: s('address1') || undefined,
        address2: s('address2') || undefined,
        postalCode: s('postalCode') || undefined,
        city: s('city') || undefined,
        province: s('province') || undefined,
        phone: s('phone') || undefined,
        licenseFileName: s('licenseFileName') || undefined,
        licenseOriginalName: s('licenseOriginalName') || undefined,
        resumeFileName: s('resumeFileName') || undefined,
        resumeOriginalName: s('resumeOriginalName') || undefined,
        extraFileName: s('extraFileName') || undefined,
        extraOriginalName: s('extraOriginalName') || undefined,
    };
}
@Injectable()
export class LocumService {
    constructor(private readonly prisma: PrismaService) { }

    private async assertLocumCanWrite(userId: string): Promise<void> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { status: true },
        });
        if (user?.status === UserStatus.SUSPENDED) {
            throw new ForbiddenException(
                'Your account is suspended. Contact support if you have questions.',
            );
        }
        if (user?.status === UserStatus.DEACTIVATED) {
            throw new ForbiddenException('Your account is deactivated.');
        }
    }

    private mapProfileToApi(
        profile: LocumProfileRow,
        user: Pick<User, 'status' | 'suspensionNote' | 'suspendedAt'>,
    ): LocumProfileApi {
        const spec = profile.specializationText?.trim() ||
            specialtyToDisplay(profile.specialty);
        return {
            firstName: profile.firstName ?? undefined,
            lastName: profile.lastName ?? undefined,
            cpsnsNumber: profile.cpsnsId,
            yearsOfExperience: profile.yearsOfExperience ?? null,
            professionalSummary: profile.summary ?? undefined,
            specialization: spec,
            address1: profile.address1 ?? undefined,
            address2: profile.address2 ?? undefined,
            postalCode: profile.postalCode ?? undefined,
            city: profile.city ?? undefined,
            province: profile.province ?? undefined,
            phone: profile.phone ?? undefined,
            licenseFile: profile.licenseFileName ?? undefined,
            licenseOriginalName: profile.licenseOriginalName ?? undefined,
            resumeFile: profile.resumeFileName ?? undefined,
            resumeOriginalName: profile.resumeOriginalName ?? undefined,
            extraFile: profile.extraFileName ?? undefined,
            extraOriginalName: profile.extraOriginalName ?? undefined,
            cpsnsVerificationStatus: profile.cpsnsVerificationStatus,
            rejectionReason: profile.rejectionReason ?? null,
            rejectedAt: profile.rejectedAt?.toISOString() ?? null,
            accountStatus: user.status,
            suspensionNote: user.suspensionNote ?? null,
            suspendedAt: user.suspendedAt?.toISOString() ?? null,
        };
    }
    async saveProfile(userId: string, body: Record<string, unknown>) {
        await this.assertLocumCanWrite(userId);
        const dto = parseSaveBody(body);
        const trimmedRaw = dto.cpsnsNumber?.trim() ?? '';
        const pendingFallback = `pending-${userId}`;
        const cpsnsDigits = trimmedRaw ? normalizeCpsns(trimmedRaw) : '';
        if (trimmedRaw && cpsnsDigits.length !== 9) {
            throw new BadRequestException('CPSNS number must be exactly 9 digits.');
        }
        const cpsnsId = cpsnsDigits.length === 9 ? cpsnsDigits : pendingFallback;
        if (cpsnsDigits.length === 9) {
            const taken = await this.prisma.locumProfile.findFirst({
                where: { cpsnsId: cpsnsDigits, userId: { not: userId } },
                select: { id: true },
            });
            if (taken) {
                throw new BadRequestException('This CPSNS number is already registered to another account.');
            }
        }
        const specialty = mapSpecialty(dto.specialization);
        const summary = dto.professionalSummary?.trim() || null;
        const specializationText = dto.specialization?.trim() || null;
        const yearsOfExperience = dto.yearsOfExperience === undefined ? null : dto.yearsOfExperience;
        const existing = await this.prisma.locumProfile.findUnique({
            where: { userId },
            select: { cpsnsId: true, cpsnsVerificationStatus: true },
        });
        const profileSubmittedForReview = Boolean(
            dto.licenseFileName?.trim()
            || dto.resumeFileName?.trim()
            || dto.firstName?.trim()
            || dto.lastName?.trim(),
        );
        const verificationPatch = credentialReviewPatchOnProfileSave(
            existing
                ? {
                      cpsnsNumber: existing.cpsnsId,
                      cpsnsVerificationStatus: existing.cpsnsVerificationStatus,
                  }
                : null,
            cpsnsDigits,
            profileSubmittedForReview,
        );
        const profile = await this.prisma.locumProfile.upsert({
            where: { userId },
            create: {
                userId,
                cpsnsId,
                ...verificationPatch,
                specialty,
                summary,
                firstName: dto.firstName,
                lastName: dto.lastName,
                yearsOfExperience,
                specializationText,
                address1: dto.address1?.trim() || null,
                address2: dto.address2?.trim() || null,
                postalCode: dto.postalCode?.trim() || null,
                city: dto.city?.trim() || null,
                province: dto.province?.trim() || null,
                phone: dto.phone?.trim() || null,
                licenseFileName: dto.licenseFileName?.trim() || null,
                licenseOriginalName: dto.licenseOriginalName?.trim() || null,
                resumeFileName: dto.resumeFileName?.trim() || null,
                resumeOriginalName: dto.resumeOriginalName?.trim() || null,
                extraFileName: dto.extraFileName?.trim() || null,
                extraOriginalName: dto.extraOriginalName?.trim() || null,
            },
            update: {
                ...(cpsnsDigits.length === 9 ? { cpsnsId: cpsnsDigits } : {}),
                ...verificationPatch,
                specialty,
                summary,
                firstName: dto.firstName,
                lastName: dto.lastName,
                yearsOfExperience,
                specializationText,
                address1: dto.address1?.trim() ?? null,
                address2: dto.address2?.trim() ?? null,
                postalCode: dto.postalCode?.trim() ?? null,
                city: dto.city?.trim() ?? null,
                province: dto.province?.trim() ?? null,
                phone: dto.phone?.trim() ?? null,
                licenseFileName: dto.licenseFileName?.trim() ?? null,
                licenseOriginalName: dto.licenseOriginalName?.trim() ?? null,
                resumeFileName: dto.resumeFileName?.trim() ?? null,
                resumeOriginalName: dto.resumeOriginalName?.trim() ?? null,
                extraFileName: dto.extraFileName?.trim() ?? null,
                extraOriginalName: dto.extraOriginalName?.trim() ?? null,
            },
        });
        const docInputs = [
            {
                type: DocumentType.CPSNS_LICENSE,
                storageUrl: dto.licenseFileName?.trim() || '',
                displayName: dto.licenseOriginalName?.trim() || '',
            },
            {
                type: DocumentType.CV,
                storageUrl: dto.resumeFileName?.trim() || '',
                displayName: dto.resumeOriginalName?.trim() || '',
            },
            {
                type: DocumentType.OTHER,
                storageUrl: dto.extraFileName?.trim() || '',
                displayName: dto.extraOriginalName?.trim() || '',
            },
        ] as const;
        await Promise.all(docInputs.map(async (d) => {
            await this.prisma.document.deleteMany({
                where: { locumProfileId: profile.id, documentType: d.type },
            });
            if (!d.storageUrl)
                return;
            const fileName = d.displayName || d.storageUrl.split('/').pop() || d.storageUrl;
            await this.prisma.document.create({
                data: {
                    locumProfileId: profile.id,
                    documentType: d.type,
                    storageUrl: d.storageUrl,
                    fileName,
                    mimeType: 'application/octet-stream',
                    sizeBytes: 0,
                },
            });
        }));
        const user = await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { status: true, suspensionNote: true, suspendedAt: true },
        });
        return { success: true, profile: this.mapProfileToApi(profile, user) };
    }
    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { status: true, suspensionNote: true, suspendedAt: true },
        });
        if (!user) {
            return { exists: false, profile: null };
        }
        const profile = await this.prisma.locumProfile.findUnique({
            where: { userId },
        });
        return {
            exists: !!profile,
            profile: profile ? this.mapProfileToApi(profile, user) : null,
        };
    }
    async countBrowseOpportunities(): Promise<number> {
        return this.prisma.jobPosting.count({
            where: { status: 'ACTIVE', isDeleted: false },
        });
    }
    async browseJobs() {
        const jobs = await this.prisma.jobPosting.findMany({
            where: { status: 'ACTIVE', isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: {
                hostProfile: {
                    select: {
                        practiceName: true,
                        city: true,
                        province: true,
                        postalCode: true,
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
    async applyToJob(userId: string, jobId: string, coverNote?: string) {
        await this.assertLocumCanWrite(userId);
        const locumProfile = await this.prisma.locumProfile.findUnique({
            where: { userId },
            select: { id: true, cpsnsVerificationStatus: true },
        });
        if (!locumProfile)
            throw new NotFoundException('Complete your profile before applying to jobs.');
        if (!isCpsnsVerificationApproved(locumProfile.cpsnsVerificationStatus)) {
            throw new BadRequestException('Your CPSNS must be verified by an administrator before you can apply to jobs.');
        }
        const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobId },
        });
        if (!job)
            throw new NotFoundException('Job not found.');
        if (job.status !== 'ACTIVE')
            throw new BadRequestException('This job is no longer accepting applications.');
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
    async getMyApplications(userId: string) {
        const locumProfile = await this.prisma.locumProfile.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (!locumProfile)
            return { applications: [] };
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
    async respondToConfirmedPlacement(userId: string, applicationId: string, response: 'accept' | 'decline') {
        if (response !== 'accept' && response !== 'decline')
            throw new BadRequestException('Choose accept or decline.');
        const locumProfile = await this.prisma.locumProfile.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (!locumProfile)
            throw new ForbiddenException();
        const app = await this.prisma.application.findFirst({
            where: { id: applicationId, locumProfileId: locumProfile.id },
            include: { jobPosting: { select: { id: true, status: true } } },
        });
        if (!app)
            throw new NotFoundException('Application not found');
        if (app.status !== 'CONFIRMED')
            throw new BadRequestException('Only host-confirmed placements can be accepted or declined.');
        if (response === 'accept') {
            if (app.locumAcceptedAt)
                throw new BadRequestException('You have already accepted this placement.');
            await this.prisma.application.update({
                where: { id: applicationId },
                data: { locumAcceptedAt: new Date(), locumResponse: 'ACCEPTED' },
            });
            await this.prisma.jobPosting.update({
                where: { id: app.jobPostingId },
                data: { status: 'ONGOING' },
            });
            return { success: true };
        }
        if (app.locumAcceptedAt)
            throw new BadRequestException('You already accepted this placement.');
        await this.prisma.$transaction(async (tx) => {
            await tx.application.update({
                where: { id: applicationId },
                data: { status: 'WITHDRAWN', locumResponse: 'REJECTED' },
            });
            if (app.jobPosting.status === 'ONGOING') {
                await tx.jobPosting.update({
                    where: { id: app.jobPostingId },
                    data: { status: 'ACTIVE' },
                });
            }
        });
        return { success: true };
    }
}
