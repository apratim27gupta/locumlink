import { Injectable, NotFoundException, ForbiddenException, BadRequestException, } from '@nestjs/common';
import { PostingStatus } from '@prisma/client';
import { GcsService } from '../gcs/gcs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SaveHostProfileDto, CreateJobDto, UpdateJobDto } from './host.dto.js';
import { normalizeCpsns } from '../cpsns/cpsns-verified.js';
@Injectable()
export class HostService {
    constructor(private readonly prisma: PrismaService, private readonly gcs: GcsService) { }
    private toHostProfileData(userId: string, dto: SaveHostProfileDto) {
        const rawCpsns = dto.cpsnsNumber?.trim() ?? '';
        const cpsnsDigits = rawCpsns ? normalizeCpsns(rawCpsns) : '';
        if (rawCpsns && cpsnsDigits.length !== 9) {
            throw new BadRequestException('CPSNS number must be exactly 9 digits.');
        }
        const address = [dto.address1, dto.address2].filter(Boolean).join(', ').trim() ||
            'Address pending';
        return {
            userId,
            practiceName: dto.clinicName,
            address,
            city: dto.city ?? '',
            postalCode: dto.postalCode ?? '',
            province: dto.province ?? 'NS',
            servicesOffered: dto.amenities ?? [],
            highlights: dto.clinicDescription ?? null,
            phone: null as string | null,
            website: null as string | null,
            ruralDesignation: null as string | null,
            contactFirstName: dto.contactFirstName?.trim() || null,
            contactLastName: dto.contactLastName?.trim() || null,
            cpsnsNumber: cpsnsDigits.length === 9 ? cpsnsDigits : null,
            speciality: dto.speciality?.trim() || null,
            address1: dto.address1?.trim() || null,
            address2: dto.address2?.trim() || null,
            accommodationProvided: dto.accommodationProvided ?? false,
            practiceType: dto.practiceType?.trim() || null,
            numPhysicians: dto.numPhysicians?.trim() || null,
            emr: dto.emrSystem?.trim() || null,
            patientVol: dto.patientVolume?.trim() || null,
        };
    }
    async saveProfile(userId: string, dto: SaveHostProfileDto) {
        const data = this.toHostProfileData(userId, dto);
        const { userId: _userIdInData, ...update } = data;
        void _userIdInData;
        const profile = await this.prisma.hostProfile.upsert({
            where: { userId },
            create: data,
            update,
        });
        return { success: true, profile };
    }
    async getProfile(userId: string) {
        const profile = await this.prisma.hostProfile.findUnique({
            where: { userId },
        });
        if (!profile)
            return { exists: false, profile: null };
        return { exists: true, profile };
    }
    private async getHostProfileId(userId: string): Promise<string> {
        const profile = await this.prisma.hostProfile.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (!profile)
            throw new NotFoundException('Host profile not found. Please complete your profile first.');
        return profile.id;
    }
    async getDashboardStats(userId: string) {
        const hostProfileId = await this.getHostProfileId(userId);
        const now = new Date();
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const lastQtr = new Date(now);
        lastQtr.setMonth(lastQtr.getMonth() - 3);
        const [totalJobs, activeJobs, completedJobs, totalApplications, prevMonthJobs, prevMonthActive, prevQtrCompleted, prevQtrApps,] = await Promise.all([
            this.prisma.jobPosting.count({ where: { hostProfileId } }),
            this.prisma.jobPosting.count({
                where: { hostProfileId, status: 'ACTIVE' },
            }),
            this.prisma.jobPosting.count({
                where: {
                    hostProfileId,
                    status: { in: ['ONGOING', 'COMPLETED', 'CANCELLED', 'EXPIRED'] },
                },
            }),
            this.prisma.application.count({
                where: { jobPosting: { hostProfileId } },
            }),
            this.prisma.jobPosting.count({
                where: { hostProfileId, createdAt: { lt: lastMonth } },
            }),
            this.prisma.jobPosting.count({
                where: {
                    hostProfileId,
                    status: 'ACTIVE',
                    createdAt: { lt: lastMonth },
                },
            }),
            this.prisma.jobPosting.count({
                where: {
                    hostProfileId,
                    status: { in: ['ONGOING', 'COMPLETED', 'CANCELLED', 'EXPIRED'] },
                    createdAt: { lt: lastQtr },
                },
            }),
            this.prisma.application.count({
                where: { jobPosting: { hostProfileId }, appliedAt: { lt: lastQtr } },
            }),
        ]);
        function pct(current: number, previous: number) {
            if (previous === 0)
                return current > 0 ? 100 : 0;
            return Math.round(Math.abs(((current - previous) / previous) * 100));
        }
        function dir(current: number, previous: number): 'up' | 'down' {
            return current >= previous ? 'up' : 'down';
        }
        return {
            totalJobsPosted: totalJobs,
            activeJobs,
            completedJobs,
            applications: totalApplications,
            comparisons: {
                totalJobsPosted: {
                    change: pct(totalJobs, prevMonthJobs),
                    direction: dir(totalJobs, prevMonthJobs),
                    period: 'month',
                },
                activeJobs: {
                    change: pct(activeJobs, prevMonthActive),
                    direction: dir(activeJobs, prevMonthActive),
                    period: 'month',
                },
                completedJobs: {
                    change: pct(completedJobs, prevQtrCompleted),
                    direction: dir(completedJobs, prevQtrCompleted),
                    period: 'quarter',
                },
                applications: {
                    change: pct(totalApplications, prevQtrApps),
                    direction: dir(totalApplications, prevQtrApps),
                    period: 'quarter',
                },
            },
        };
    }
    async createJob(userId: string, dto: CreateJobDto) {
        const hostProfileId = await this.getHostProfileId(userId);
        const hostProfile = await this.prisma.hostProfile.findUnique({
            where: { id: hostProfileId },
            select: { cpsnsNumber: true },
        });
        const isVerified = !!(hostProfile?.cpsnsNumber && hostProfile.cpsnsNumber.replace(/\D/g, '').length === 9);
        const status: PostingStatus = isVerified ? PostingStatus.ACTIVE : PostingStatus.DRAFT;
        const job = await this.prisma.jobPosting.create({
            data: {
                hostProfileId,
                title: dto.title,
                description: dto.description ?? '',
                servicesRequired: dto.servicesRequired ?? [],
                status,
                location: dto.location ?? '',
                isRural: dto.isRural ?? false,
                accommodationProvided: dto.accommodationProvided ?? false,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
                keyResponsibilities: dto.keyResponsibilities ?? [],
                startDate: dto.startDate ? new Date(dto.startDate) : null,
                endDate: dto.endDate ? new Date(dto.endDate) : null,
                startTime: dto.startTime ?? null,
                endTime: dto.endTime ?? null,
                payPerDay: dto.payPerDay ?? null,
                minYearsExperience: dto.minYearsExperience ?? null,
                maxApplicants: dto.maxApplicants ?? 20,
                travelRequired: dto.travelRequired ?? false,
                scheduleFlexible: dto.scheduleFlexible ?? false,
                requiredCredentials: dto.requiredCredentials ?? [],
            },
        });
        return { success: true, job };
    }
    async getJobs(userId: string) {
        const hostProfileId = await this.getHostProfileId(userId);
        const jobs = await this.prisma.jobPosting.findMany({
            where: { hostProfileId, isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { applications: true } },
                shifts: true,
            },
        });
        const now = new Date();
        // Auto-transition ONGOING -> COMPLETED when end date has passed
        const toComplete = jobs.filter(
            (j) => j.status === 'ONGOING' && j.endDate && new Date(j.endDate) < now
        );
        if (toComplete.length > 0) {
            await this.prisma.jobPosting.updateMany({
                where: { id: { in: toComplete.map((j) => j.id) } },
                data: { status: 'COMPLETED' },
            });
            toComplete.forEach((j) => { j.status = 'COMPLETED' as any; });
        }
        // Also auto-transition ACTIVE -> EXPIRED when end date has passed
        const toExpire = jobs.filter(
            (j) => j.status === 'ACTIVE' && j.endDate && new Date(j.endDate) < now
        );
        if (toExpire.length > 0) {
            await this.prisma.jobPosting.updateMany({
                where: { id: { in: toExpire.map((j) => j.id) } },
                data: { status: 'EXPIRED' },
            });
            toExpire.forEach((j) => { j.status = 'EXPIRED' as any; });
        }
        return {
            jobs: jobs.map((j) => ({
                ...j,
                applicationsCount: j._count.applications,
            })),
        };
    }
    async getJob(userId: string, jobId: string) {
        const hostProfileId = await this.getHostProfileId(userId);
        const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobId },
            include: { _count: { select: { applications: true } }, shifts: true },
        });
        if (!job)
            throw new NotFoundException('Job not found');
        if (job.hostProfileId !== hostProfileId)
            throw new ForbiddenException();
        return { job: { ...job, applicationsCount: job._count.applications } };
    }
    async updateJob(userId: string, jobId: string, dto: UpdateJobDto) {
        const hostProfileId = await this.getHostProfileId(userId);
        const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobId },
        });
        if (!job)
            throw new NotFoundException('Job not found');
        if (job.hostProfileId !== hostProfileId)
            throw new ForbiddenException();
        const updated = await this.prisma.jobPosting.update({
            where: { id: jobId },
            data: {
                ...(dto.title != null && { title: dto.title }),
                ...(dto.description != null && { description: dto.description }),
                ...(dto.status != null && { status: dto.status as PostingStatus }),
                ...(dto.location != null && { location: dto.location }),
                ...(dto.keyResponsibilities != null && {
                    keyResponsibilities: dto.keyResponsibilities,
                }),
                ...(dto.startDate != null && { startDate: new Date(dto.startDate) }),
                ...(dto.endDate != null && { endDate: new Date(dto.endDate) }),
                ...(dto.startTime != null && { startTime: dto.startTime }),
                ...(dto.endTime != null && { endTime: dto.endTime }),
                ...(dto.payPerDay != null && { payPerDay: dto.payPerDay }),
                ...(dto.minYearsExperience != null && {
                    minYearsExperience: dto.minYearsExperience,
                }),
                ...(dto.maxApplicants != null && { maxApplicants: dto.maxApplicants }),
                ...(dto.travelRequired != null && {
                    travelRequired: dto.travelRequired,
                }),
                ...(dto.scheduleFlexible != null && {
                    scheduleFlexible: dto.scheduleFlexible,
                }),
                ...(dto.requiredCredentials != null && {
                    requiredCredentials: dto.requiredCredentials,
                }),
            },
        });
        return { success: true, job: updated };
    }
    async deleteJob(userId: string, jobId: string) {
        const hostProfileId = await this.getHostProfileId(userId);
        const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobId },
        });
        if (!job)
            throw new NotFoundException('Job not found');
        if (job.hostProfileId !== hostProfileId)
            throw new ForbiddenException();
        await this.prisma.jobPosting.update({ where: { id: jobId }, data: { isDeleted: true } });
        return { success: true };
    }
    async reopenJob(userId: string, jobId: string, dto: {
        additionalApplicants: number;
        startDate?: string;
        endDate?: string;
    }) {
        const hostProfileId = await this.getHostProfileId(userId);
        const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobId },
            include: { _count: { select: { applications: true } } },
        });
        if (!job)
            throw new NotFoundException('Job not found');
        if (job.hostProfileId !== hostProfileId)
            throw new ForbiddenException();
        const appCount = job._count.applications;
        const atApplicantCap = job.status === 'ACTIVE' && appCount >= job.maxApplicants;
        const endMs = job.endDate ? new Date(job.endDate).getTime() : NaN;
        const pastEndDate = Number.isFinite(endMs) && new Date(endMs) < new Date();
        const eligible = job.status === 'ONGOING' ||
            job.status === 'COMPLETED' ||
            job.status === 'EXPIRED' ||
            job.status === 'CANCELLED' ||
            atApplicantCap ||
            pastEndDate;
        if (!eligible) {
            throw new BadRequestException('This job cannot be reopened (must be filled, expired, cancelled, past end date, or at applicant limit).');
        }
        const hasBothSchedule = dto.startDate != null &&
            dto.startDate.trim() !== '' &&
            dto.endDate != null &&
            dto.endDate.trim() !== '';
        if (pastEndDate && !hasBothSchedule) {
            throw new BadRequestException('Start and end dates are required to reopen a job that has ended.');
        }
        let startDateParsed: Date | undefined;
        let endDateParsed: Date | undefined;
        if (hasBothSchedule) {
            startDateParsed = new Date(dto.startDate as string);
            endDateParsed = new Date(dto.endDate as string);
            if (Number.isNaN(startDateParsed.getTime()) || Number.isNaN(endDateParsed.getTime()))
                throw new BadRequestException('Invalid start or end date.');
            if (endDateParsed < startDateParsed)
                throw new BadRequestException('End date must be on or after start date.');
        }
        else if ((dto.startDate != null && dto.startDate.trim() !== '') ||
            (dto.endDate != null && dto.endDate.trim() !== '')) {
            throw new BadRequestException('Both start date and end date are required.');
        }
        if (job.status === 'ONGOING') {
            await this.prisma.application.updateMany({
                where: { jobPostingId: jobId, status: 'CONFIRMED' },
                data: { status: 'SHORTLISTED' },
            });
        }
        const updated = await this.prisma.jobPosting.update({
            where: { id: jobId },
            data: {
                status: 'ACTIVE',
                maxApplicants: job.maxApplicants + dto.additionalApplicants,
                ...(startDateParsed != null &&
                    endDateParsed != null && {
                    startDate: startDateParsed,
                    endDate: endDateParsed,
                }),
            },
        });
        return { success: true, job: updated };
    }
    async getApplications(userId: string, jobId: string) {
        const hostProfileId = await this.getHostProfileId(userId);
        const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobId },
        });
        if (!job)
            throw new NotFoundException('Job not found');
        if (job.hostProfileId !== hostProfileId)
            throw new ForbiddenException();
        const applications = await this.prisma.application.findMany({
            where: { jobPostingId: jobId },
            orderBy: { appliedAt: 'desc' },
            select: {
                id: true,
                status: true,
                locumResponse: true,
                appliedAt: true,
                locumProfile: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        userId: true,
                        cpsnsId: true,
                        specialty: true,
                        specializationText: true,
                        summary: true,
                        yearsOfExperience: true,
                        city: true,
                        province: true,
                        documents: {
                            select: {
                                id: true,
                                documentType: true,
                                storageUrl: true,
                                fileName: true,
                            },
                        },
                        user: { select: { email: true } },
                    },
                },
            },
        });
        const withSignedDocs = await Promise.all(applications.map(async (a) => {
            const docs = Array.isArray(a.locumProfile?.documents) ? a.locumProfile.documents : [];
            const signed = await Promise.all(docs.map(async (d) => ({
                ...d,
                storageUrl: await this.gcs.signedUrl(d.storageUrl),
            })));
            return {
                ...a,
                locumResponse: a.locumResponse ?? null,
                locumProfile: {
                    ...a.locumProfile,
                    documents: signed,
                },
            };
        }));
        return { applications: withSignedDocs };
    }
    async updateApplication(userId: string, jobId: string, appId: string, status: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED') {
        const hostProfileId = await this.getHostProfileId(userId);
        const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobId },
        });
        if (!job)
            throw new NotFoundException('Job not found');
        if (job.hostProfileId !== hostProfileId)
            throw new ForbiddenException();
        const updated = await this.prisma.application.update({
            where: { id: appId },
            data: { status },
        });

        return { success: true, application: updated };
    }
}
