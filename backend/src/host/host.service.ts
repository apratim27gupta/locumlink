import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PostingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SaveHostProfileDto, CreateJobDto, UpdateJobDto } from './host.dto.js';

@Injectable()
export class HostService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profile ───────────────────────────────────────────────────────────────

  private toHostProfileData(userId: string, dto: SaveHostProfileDto) {
    const address =
      [dto.address1, dto.address2].filter(Boolean).join(', ').trim() ||
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
      cpsnsNumber: dto.cpsnsNumber?.trim() || null,
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
    if (!profile) return { exists: false, profile: null };
    return { exists: true, profile };
  }

  // ── Shared helper ────────────────────────────────────────────────────────

  private async getHostProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile)
      throw new NotFoundException(
        'Host profile not found. Please complete your profile first.',
      );
    return profile.id;
  }

  // ── Dashboard Stats ───────────────────────────────────────────────────────

  async getDashboardStats(userId: string) {
    const hostProfileId = await this.getHostProfileId(userId);

    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastQtr = new Date(now);
    lastQtr.setMonth(lastQtr.getMonth() - 3);

    const [
      totalJobs,
      activeJobs,
      completedJobs,
      totalApplications,
      prevMonthJobs,
      prevMonthActive,
      prevQtrCompleted,
      prevQtrApps,
    ] = await Promise.all([
      this.prisma.jobPosting.count({ where: { hostProfileId } }),
      this.prisma.jobPosting.count({
        where: { hostProfileId, status: 'ACTIVE' },
      }),
      this.prisma.jobPosting.count({
        where: {
          hostProfileId,
          status: { in: ['FILLED', 'CANCELLED', 'EXPIRED'] },
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
          status: { in: ['FILLED', 'CANCELLED', 'EXPIRED'] },
          createdAt: { lt: lastQtr },
        },
      }),
      this.prisma.application.count({
        where: { jobPosting: { hostProfileId }, appliedAt: { lt: lastQtr } },
      }),
    ]);

    function pct(current: number, previous: number) {
      if (previous === 0) return current > 0 ? 100 : 0;
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

  // ── Jobs ──────────────────────────────────────────────────────────────────

  async createJob(userId: string, dto: CreateJobDto) {
    const hostProfileId = await this.getHostProfileId(userId);

    // ── FIX Issue 6: honour status from DTO ────────────────────────────────
    // Frontend sends 'ACTIVE' for verified hosts and 'DRAFT' for unverified.
    // Only allow ACTIVE or DRAFT on create; anything else falls back to DRAFT.
    const allowedCreateStatuses: PostingStatus[] = ['ACTIVE', 'DRAFT'];
    const requestedStatus = dto.status as PostingStatus | undefined;
    const status: PostingStatus =
      requestedStatus && allowedCreateStatuses.includes(requestedStatus)
        ? requestedStatus
        : PostingStatus.ACTIVE;

    const job = await this.prisma.jobPosting.create({
      data: {
        hostProfileId,
        title: dto.title,
        description: dto.description ?? '',
        servicesRequired: dto.servicesRequired ?? [],
        status, // ← was hardcoded 'ACTIVE'
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
      where: { hostProfileId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { applications: true } },
        shifts: true,
      },
    });
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
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();
    return { job: { ...job, applicationsCount: job._count.applications } };
  }

  async updateJob(userId: string, jobId: string, dto: UpdateJobDto) {
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();

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
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();
    await this.prisma.jobPosting.delete({ where: { id: jobId } });
    return { success: true };
  }

  // ── Reopen ────────────────────────────────────────────────────────────────

  async reopenJob(userId: string, jobId: string, additionalApplicants: number) {
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();
    if (job.status !== 'FILLED')
      throw new BadRequestException('Only filled jobs can be reopened');

    await this.prisma.application.updateMany({
      where: { jobPostingId: jobId, status: 'CONFIRMED' },
      data: { status: 'SHORTLISTED' },
    });

    const updated = await this.prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        status: 'ACTIVE',
        maxApplicants: job.maxApplicants + additionalApplicants,
      },
    });
    return { success: true, job: updated };
  }

  // ── Applications ──────────────────────────────────────────────────────────

  async getApplications(userId: string, jobId: string) {
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();

    const applications = await this.prisma.application.findMany({
      where: { jobPostingId: jobId },
      orderBy: { appliedAt: 'desc' },
      include: {
        locumProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
            cpsnsId: true,
            specialty: true,
            summary: true,
            yearsOfExperience: true,
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
    return { applications };
  }

  async updateApplication(
    userId: string,
    jobId: string,
    appId: string,
    status: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED',
  ) {
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();

    const updated = await this.prisma.application.update({
      where: { id: appId },
      data: { status },
    });

    if (status === 'CONFIRMED') {
      await this.prisma.jobPosting.update({
        where: { id: jobId },
        data: { status: 'FILLED' },
      });
    }
    return { success: true, application: updated };
  }
}
