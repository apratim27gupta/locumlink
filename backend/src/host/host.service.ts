import { PushService } from '../notifications/push.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import { formatAdminDoctorName } from '../notifications/admin-notification-copy.js';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  paginateJobPostings,
  paginateApplications,
  parsePaginationParams,
} from '../common/pagination/index.js';
import {
  Prisma,
  PostingStatus,
  Role,
  UserStatus,
  VerificationStatus,
  type HostProfile as HostProfileRow,
  type User,
} from '@prisma/client';
import { GcsService } from '../gcs/gcs.service.js';
import { assertOwnsStoragePath } from '../common/utils/storage-path.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SaveHostProfileDto, CreateJobDto, UpdateJobDto } from './host.dto.js';
import {
  isCpsnsVerificationApproved,
  normalizeCpsns,
  credentialReviewPatchOnProfileSave,
  didCpsnsDocumentChange,
  didCpsnsNumberChange,
  mergeCredentialReviewPatchForAccountPending,
  mergeCredentialSubmittedAtPatch,
} from '../cpsns/cpsns-verified.js';
import {
  assertJobScheduleAcceptable,
  formatCalendarDateForApi,
  isPostingEndDatePassed,
} from './job-schedule.util.js';

function mapJobPostingForApi<T extends { startDate?: Date | null; endDate?: Date | null }>(
  job: T,
): T & { startDate: string | null; endDate: string | null } {
  return {
    ...job,
    startDate: formatCalendarDateForApi(job.startDate ?? null),
    endDate: formatCalendarDateForApi(job.endDate ?? null),
  };
}

export type HostProfileApi = {
  clinicName: string;
  contactFirstName: string;
  contactLastName: string;
  cpsnsNumber: string;
  speciality: string;
  licenseFile: string | null;
  licenseOriginalName: string | null;
  photoIdFile: string | null;
  photoIdOriginalName: string | null;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  province: string;
  amenities: string[];
  accommodationProvided: boolean;
  practiceType: string;
  numPhysicians: string;
  emr: string;
  patientVol: string;
  clinicDesc: string;
  cpsnsVerificationStatus: VerificationStatus;
  rejectionReason: string | null;
  rejectedAt: string | null;
  accountStatus: UserStatus;
  suspensionNote: string | null;
  suspendedAt: string | null;
};

@Injectable()
export class HostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly pushService: PushService,
    private readonly notifService: NotificationsService,
    private readonly adminNotif: AdminNotificationsService,
  ) {}

  private async assertHostCanWrite(userId: string): Promise<void> {
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
    profile: HostProfileRow,
    user: Pick<User, 'status' | 'suspensionNote' | 'suspendedAt'>,
  ): HostProfileApi {
    return {
      clinicName: profile.practiceName ?? '',
      contactFirstName: profile.contactFirstName ?? '',
      contactLastName: profile.contactLastName ?? '',
      cpsnsNumber: profile.cpsnsNumber ?? '',
      speciality: profile.speciality ?? '',
      licenseFile: profile.licenseFile ?? null,
      licenseOriginalName: profile.licenseOriginalName ?? null,
      // PRD 9.1 comment AT42: photo ID
      photoIdFile: profile.photoIdFile ?? null,
      photoIdOriginalName: profile.photoIdOriginalName ?? null,
      address1: profile.address1 ?? '',
      address2: profile.address2 ?? '',
      postalCode: profile.postalCode ?? '',
      city: profile.city ?? '',
      province: profile.province ?? '',
      amenities: profile.servicesOffered ?? [],
      accommodationProvided: profile.accommodationProvided ?? false,
      practiceType: profile.practiceType ?? '',
      numPhysicians: profile.numPhysicians ?? '',
      emr: profile.emr ?? '',
      patientVol: profile.patientVol ?? '',
      clinicDesc: (profile.highlights ?? '').slice(0, 1000),
      cpsnsVerificationStatus: profile.cpsnsVerificationStatus,
      rejectionReason: profile.rejectionReason ?? null,
      rejectedAt: profile.rejectedAt?.toISOString() ?? null,
      accountStatus: user.status,
      suspensionNote: user.suspensionNote ?? null,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
    };
  }

  private toHostProfileData(userId: string, dto: SaveHostProfileDto) {
    const rawCpsns = dto.cpsnsNumber?.trim() ?? '';
    const cpsnsDigits = rawCpsns ? normalizeCpsns(rawCpsns) : '';
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
      highlights: (dto.clinicDescription ?? dto.clinicDesc)?.trim() || null,
      phone: null as string | null,
      website: null as string | null,
      ruralDesignation: null as string | null,
      contactFirstName: dto.contactFirstName?.trim() || null,
      contactLastName: dto.contactLastName?.trim() || null,
      cpsnsNumber: cpsnsDigits || null,
      speciality: dto.speciality?.trim() || null,
      address1: dto.address1?.trim() || null,
      address2: dto.address2?.trim() || null,
      accommodationProvided: dto.accommodationProvided ?? false,
      practiceType: dto.practiceType?.trim() || null,
      numPhysicians: dto.numPhysicians?.trim() || null,
      emr: (dto.emrSystem ?? dto.emr)?.trim() || null,
      patientVol: (dto.patientVolume ?? dto.patientVol)?.trim() || null,
      licenseFile: dto.licenseFile ?? null,
      licenseOriginalName: dto.licenseOriginalName?.trim() || null,
      // PRD 9.1 comment AT42: save photo ID
      photoIdFile: dto.photoIdFile ?? null,
      photoIdOriginalName: dto.photoIdOriginalName?.trim() || null,
    };
  }

  async saveProfile(userId: string, dto: SaveHostProfileDto) {
    await this.assertHostCanWrite(userId);
    const licensePath = dto.licenseFile?.trim();
    if (licensePath) assertOwnsStoragePath(licensePath, userId);
    const photoPath = dto.photoIdFile?.trim();
    if (photoPath) assertOwnsStoragePath(photoPath, userId);
    const data = this.toHostProfileData(userId, dto);
    const { userId: _userIdInData, ...update } = data;
    void _userIdInData;
    const rawCpsns = dto.cpsnsNumber?.trim() ?? '';
    const cpsnsDigits = rawCpsns ? normalizeCpsns(rawCpsns) : '';
    const [existing, account] = await Promise.all([
      this.prisma.hostProfile.findUnique({
        where: { userId },
        select: {
          cpsnsNumber: true,
          cpsnsVerificationStatus: true,
          licenseFile: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true },
      }),
    ]);
    const profileSubmittedForReview = Boolean(
      dto.licenseFile || dto.photoIdFile || dto.clinicName?.trim(),
    );
    const verificationPatch = mergeCredentialSubmittedAtPatch(
      existing?.cpsnsVerificationStatus,
      mergeCredentialReviewPatchForAccountPending(
        existing
          ? {
              cpsnsNumber: existing.cpsnsNumber,
              cpsnsVerificationStatus: existing.cpsnsVerificationStatus,
            }
          : null,
        credentialReviewPatchOnProfileSave(
          existing
            ? {
                cpsnsNumber: existing.cpsnsNumber,
                cpsnsVerificationStatus: existing.cpsnsVerificationStatus,
              }
            : null,
          cpsnsDigits,
          profileSubmittedForReview,
        ),
        profileSubmittedForReview,
        account?.status === UserStatus.PENDING,
      ),
    );
    const profile = await this.prisma.hostProfile.upsert({
      where: { userId },
      create: { ...data, ...verificationPatch },
      update: { ...update, ...verificationPatch },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, suspensionNote: true, suspendedAt: true },
    });

    const doctorName = formatAdminDoctorName(
      dto.contactFirstName,
      dto.contactLastName,
      dto.clinicName?.trim() || 'Host physician',
    );
    const cpsnsNumberChanged = didCpsnsNumberChange(
      existing?.cpsnsNumber,
      cpsnsDigits,
    );
    const cpsnsLicenseChanged = didCpsnsDocumentChange(
      existing?.licenseFile,
      dto.licenseFile,
    );
    try {
      if (cpsnsNumberChanged) {
        await this.adminNotif.notifyCpsnsUpdated({
          doctorName,
          changeType: 'number',
          profileId: profile.id,
          profileType: 'HostProfile',
        });
      }
      if (cpsnsLicenseChanged) {
        await this.adminNotif.notifyCpsnsUpdated({
          doctorName,
          changeType: 'document',
          profileId: profile.id,
          profileType: 'HostProfile',
        });
      }
      const skipGenericCredential =
        cpsnsNumberChanged || cpsnsLicenseChanged;
      if (profileSubmittedForReview && !skipGenericCredential) {
        const credentialType = dto.photoIdFile?.trim()
          ? 'photo ID documents'
          : 'credentials';
        await this.adminNotif.notifyCredentialUploaded({
          doctorName,
          credentialType,
          profileId: profile.id,
          profileType: 'HostProfile',
        });
      }
    } catch {}

    return { success: true, profile: this.mapProfileToApi(profile, user) };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, suspensionNote: true, suspendedAt: true },
    });
    if (!user) return { exists: false, profile: null };
    const profile = await this.prisma.hostProfile.findUnique({
      where: { userId },
    });
    if (!profile) return { exists: false, profile: null };
    return { exists: true, profile: this.mapProfileToApi(profile, user) };
  }

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

  /** L-001: broadcast new ACTIVE posting to verified locums. */
  private async notifyVerifiedLocumsOfNewOpportunity(
    hostProfileId: string,
    job: {
      id: string;
      title: string;
      status: string;
      startDate: Date | null;
      payPerDay: unknown;
    },
  ): Promise<void> {
    if (job.status !== 'ACTIVE') return;
    try {
      const hostLoc = await this.prisma.hostProfile.findUnique({
        where: { id: hostProfileId },
        select: { city: true, province: true },
      });
      const activeLocums = await this.prisma.user.findMany({
        where: {
          role: 'LOCUM',
          status: 'ACTIVE',
          locumProfile: {
            cpsnsVerificationStatus: VerificationStatus.VERIFIED,
          },
        },
        select: {
          id: true,
          email: true,
          locumProfile: { select: { firstName: true, lastName: true } },
        },
      });
      await Promise.allSettled(
        activeLocums.map((locum) =>
          this.notifService.notifyLocumNewOpportunity({
            recipientId: locum.id,
            recipientEmail: locum.email,
            firstName: locum.locumProfile?.firstName,
            lastName: locum.locumProfile?.lastName,
            jobId: job.id,
            jobTitle: job.title,
            startDate: job.startDate,
            payPerDay: job.payPerDay != null ? Number(job.payPerDay) : null,
            city: hostLoc?.city,
            province: hostLoc?.province,
          }),
        ),
      );
    } catch {}
  }

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
      this.prisma.jobPosting.count({
        where: { hostProfileId, status: { not: 'DRAFT' } },
      }),
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
        where: {
          jobPosting: { hostProfileId },
          appliedAt: { lt: lastQtr },
        },
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

  async createJob(userId: string, dto: CreateJobDto) {
    await this.assertHostCanWrite(userId);
    const hostProfileId = await this.getHostProfileId(userId);
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { id: hostProfileId },
      select: { cpsnsVerificationStatus: true },
    });
    const isVerified = isCpsnsVerificationApproved(
      hostProfile?.cpsnsVerificationStatus,
    );
    const requestedStatus =
      typeof dto.status === 'string' ? dto.status.toUpperCase() : '';
    const saveAsDraft =
      dto.saveAsDraft === true ||
      String(dto.saveAsDraft) === 'true' ||
      requestedStatus === 'DRAFT';
    const status: PostingStatus = saveAsDraft
      ? PostingStatus.DRAFT
      : requestedStatus === 'ACTIVE' && isVerified
        ? PostingStatus.ACTIVE
        : isVerified
          ? PostingStatus.ACTIVE
          : PostingStatus.DRAFT;

    const schedule = assertJobScheduleAcceptable({
      startDate: dto.startDate,
      endDate: dto.endDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      allowPast: saveAsDraft,
    });

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
        startDate: schedule.startDate ?? null,
        endDate: schedule.endDate ?? null,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        payPerDay: dto.payPerDay ?? null,
        minYearsExperience: dto.minYearsExperience ?? null,
        travelRequired: dto.travelRequired ?? false,
        scheduleFlexible: dto.scheduleFlexible ?? false,
        requiredCredentials: dto.requiredCredentials ?? [],
        // PRD Section 2.2: save leave type + full/half day
        leaveType: dto.leaveType ?? null,
        fullHalfDay: dto.fullHalfDay ?? null,
      },
    });

    await this.notifyVerifiedLocumsOfNewOpportunity(hostProfileId, job);
    return {
      success: true,
      job: {
        ...mapJobPostingForApi(job),
        status: job.status,
        applicationsCount: 0,
        payPerDay: job.payPerDay != null ? Number(job.payPerDay) : null,
      },
    };
  }

  private async syncHostJobPostingStatuses(hostProfileId: string): Promise<void> {
    const jobs = await this.prisma.jobPosting.findMany({
      where: {
        hostProfileId,
        isDeleted: false,
        status: { in: ['ONGOING', 'ACTIVE'] },
      },
      select: {
        id: true,
        status: true,
        endDate: true,
        applications: {
          where: {
            OR: [
              { locumResponse: 'ACCEPTED' },
              { locumAcceptedAt: { not: null } },
            ],
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    const toComplete = jobs.filter(
      (j) =>
        j.status === 'ONGOING' &&
        isPostingEndDatePassed(j.endDate) &&
        j.applications.length > 0,
    );
    if (toComplete.length > 0) {
      await this.prisma.jobPosting.updateMany({
        where: { id: { in: toComplete.map((j) => j.id) } },
        data: { status: 'COMPLETED' },
      });
    }

    const toExpire = jobs.filter(
      (j) => j.status === 'ACTIVE' && isPostingEndDatePassed(j.endDate),
    );
    if (toExpire.length > 0) {
      await this.prisma.jobPosting.updateMany({
        where: { id: { in: toExpire.map((j) => j.id) } },
        data: { status: 'EXPIRED' },
      });
    }
  }

  async getJobs(userId: string, query: Record<string, unknown> = {}) {
    const hostProfileId = await this.getHostProfileId(userId);
    const deletedOnly = query.deleted === 'true' || query.deleted === true;
    const pagination = parsePaginationParams(query, 20);
    pagination.direction = 'desc';

    if (!deletedOnly) {
      await this.syncHostJobPostingStatuses(hostProfileId);
    }

    const statusRaw =
      typeof query.status === 'string' ? query.status.toUpperCase() : undefined;
    const statusFilter =
      statusRaw && Object.values(PostingStatus).includes(statusRaw as PostingStatus)
        ? (statusRaw as PostingStatus)
        : undefined;

    const page = await paginateJobPostings(
      this.prisma,
      {
        hostProfileId,
        isDeleted: deletedOnly,
        status: statusFilter,
      },
      pagination,
      {
        _count: { select: { applications: true } },
        shifts: true,
        applications: {
          where: {
            OR: [
              { locumResponse: 'ACCEPTED' },
              { locumAcceptedAt: { not: null } },
            ],
          },
          select: { id: true },
          take: 1,
        },
      },
    );

    const jobIds = page.items.map((j) => j.id);
    const latestAppliedByJobId = new Map<string, Date>();
    if (jobIds.length > 0) {
      const latestRows = await this.prisma.$queryRaw<
        Array<{ jobPostingId: string; latest_applied: Date }>
      >`
        SELECT "jobPostingId", MAX("appliedAt") AS latest_applied
        FROM applications
        WHERE "jobPostingId" IN (${Prisma.join(jobIds)})
        GROUP BY "jobPostingId"
      `;
      for (const row of latestRows) {
        latestAppliedByJobId.set(row.jobPostingId, row.latest_applied);
      }
    }

    const sortedItems = [...page.items].sort((a, b) => {
      const aSort = latestAppliedByJobId.get(a.id) ?? a.createdAt;
      const bSort = latestAppliedByJobId.get(b.id) ?? b.createdAt;
      return bSort.getTime() - aSort.getTime();
    });

    return {
      items: sortedItems.map((j) => {
        const { _count, shifts: _shifts, applications: acceptedApps, ...rest } =
          j;
        return {
          ...mapJobPostingForApi(rest),
          status: j.status,
          applicationsCount: _count.applications,
          hasAcceptedLocum: acceptedApps.length > 0,
          payPerDay: j.payPerDay != null ? Number(j.payPerDay) : null,
        };
      }),
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
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
    return {
      job: {
        ...mapJobPostingForApi(job),
        applicationsCount: job._count.applications,
      },
    };
  }

  async updateJob(userId: string, jobId: string, dto: UpdateJobDto) {
    await this.assertHostCanWrite(userId);
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();

    const ALLOWED_TRANSITIONS: Partial<
      Record<PostingStatus, PostingStatus[]>
    > = {
      DRAFT: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['DRAFT', 'CANCELLED'],
      ONGOING: ['CANCELLED'],
      EXPIRED: [],
      COMPLETED: [],
      CANCELLED: [],
    };

    let statusToSave: PostingStatus | undefined;
    if (dto.status != null) {
      const requestedStatus = String(dto.status).toUpperCase();
      if (requestedStatus === 'ACTIVE') {
        const hostProfile = await this.prisma.hostProfile.findUnique({
          where: { id: hostProfileId },
          select: { cpsnsVerificationStatus: true },
        });
        const isVerified = isCpsnsVerificationApproved(
          hostProfile?.cpsnsVerificationStatus,
        );
        statusToSave = isVerified ? PostingStatus.ACTIVE : PostingStatus.DRAFT;
      } else {
        statusToSave = requestedStatus as PostingStatus;
      }
    }

    if (statusToSave != null && statusToSave !== job.status) {
      const allowed = ALLOWED_TRANSITIONS[job.status] ?? [];
      if (!allowed.includes(statusToSave)) {
        throw new BadRequestException(
          `Cannot transition job from ${job.status} to ${statusToSave}.`,
        );
      }
    }

    const publishingActive = statusToSave === PostingStatus.ACTIVE;
    const schedule =
      dto.startDate != null || dto.endDate != null
        ? assertJobScheduleAcceptable({
            startDate: dto.startDate,
            endDate: dto.endDate,
            startTime: dto.startTime,
            endTime: dto.endTime,
            allowPast: !publishingActive && job.status === PostingStatus.DRAFT,
          })
        : {};

    const updated = await this.prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        ...(dto.title != null && { title: dto.title }),
        ...(dto.description != null && { description: dto.description }),
        ...(statusToSave != null && { status: statusToSave }),
        ...(dto.location != null && { location: dto.location }),
        ...(dto.keyResponsibilities != null && {
          keyResponsibilities: dto.keyResponsibilities,
        }),
        ...(schedule.startDate != null && { startDate: schedule.startDate }),
        ...(schedule.endDate != null && { endDate: schedule.endDate }),
        ...(dto.startTime != null && { startTime: dto.startTime }),
        ...(dto.endTime != null && { endTime: dto.endTime }),
        ...(dto.payPerDay != null && { payPerDay: dto.payPerDay }),
        ...(dto.minYearsExperience != null && {
          minYearsExperience: dto.minYearsExperience,
        }),
        ...(dto.travelRequired != null && {
          travelRequired: dto.travelRequired,
        }),
        ...(dto.scheduleFlexible != null && {
          scheduleFlexible: dto.scheduleFlexible,
        }),
        ...(dto.requiredCredentials != null && {
          requiredCredentials: dto.requiredCredentials,
        }),
        // PRD Section 2.2: allow updating leave type + full/half day
        ...(dto.leaveType != null && { leaveType: dto.leaveType }),
        ...(dto.fullHalfDay != null && { fullHalfDay: dto.fullHalfDay }),
      },
    });
    const newlyPublished =
      publishingActive && job.status === PostingStatus.DRAFT;
    if (newlyPublished) {
      await this.notifyVerifiedLocumsOfNewOpportunity(hostProfileId, updated);
    }
    return { success: true, job: updated };
  }

  async deleteJob(userId: string, jobId: string) {
    await this.assertHostCanWrite(userId);
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();
    await this.prisma.jobPosting.update({
      where: { id: jobId },
      data: { isDeleted: true },
    });
    // L-012: notify confirmed locums of cancellation
    try {
      const confirmed = await this.prisma.application.findMany({
        where: { jobPostingId: jobId, status: 'CONFIRMED' },
        select: {
          locumProfile: {
            select: {
              userId: true,
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          },
        },
      });
      const hostProfile = await this.prisma.hostProfile.findUnique({
        where: { id: job.hostProfileId },
        select: { practiceName: true },
      });
      const clinicName = hostProfile?.practiceName ?? 'the clinic';
      await Promise.allSettled(
        confirmed.map((app) => {
          const locum = app.locumProfile;
          if (!locum?.userId || !locum.user.email) return Promise.resolve();
          return this.notifService.notifyLocumShiftCancelled({
            recipientId: locum.userId,
            recipientEmail: locum.user.email,
            firstName: locum.firstName,
            lastName: locum.lastName,
            clinicName,
            jobTitle: job.title,
            startDate: job.startDate,
            jobId,
          });
        }),
      );
    } catch {}
    return { success: true };
  }

  async reopenJob(
    userId: string,
    jobId: string,
    dto: {
      startDate?: string;
      endDate?: string;
    },
  ) {
    await this.assertHostCanWrite(userId);
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();

    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { id: hostProfileId },
      select: { cpsnsVerificationStatus: true },
    });
    const isVerified = isCpsnsVerificationApproved(
      hostProfile?.cpsnsVerificationStatus,
    );

    const pastEndDate = isPostingEndDatePassed(job.endDate);
    const eligible =
      job.status === 'ONGOING' ||
      job.status === 'COMPLETED' ||
      job.status === 'EXPIRED' ||
      job.status === 'CANCELLED' ||
      pastEndDate;

    if (!eligible) {
      throw new BadRequestException(
        'This job cannot be reopened (must be filled, expired, cancelled, or past end date).',
      );
    }

    const hasBothSchedule =
      dto.startDate != null &&
      dto.startDate.trim() !== '' &&
      dto.endDate != null &&
      dto.endDate.trim() !== '';

    if (pastEndDate && !hasBothSchedule) {
      throw new BadRequestException(
        'Start and end dates are required to reopen a job that has ended.',
      );
    }

    let startDateParsed: Date | undefined;
    let endDateParsed: Date | undefined;
    if (hasBothSchedule) {
      const schedule = assertJobScheduleAcceptable({
        startDate: dto.startDate,
        endDate: dto.endDate,
        allowPast: false,
      });
      startDateParsed = schedule.startDate;
      endDateParsed = schedule.endDate;
    } else if (
      (dto.startDate != null && dto.startDate.trim() !== '') ||
      (dto.endDate != null && dto.endDate.trim() !== '')
    ) {
      throw new BadRequestException(
        'Both start date and end date are required.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Reopen = fresh job — delete ALL previous applications
      await tx.application.deleteMany({
        where: { jobPostingId: jobId },
      });
      return tx.jobPosting.update({
        where: { id: jobId },
        data: {
          status: isVerified ? 'ACTIVE' : 'DRAFT',
          ...(startDateParsed != null &&
            endDateParsed != null && {
              startDate: startDateParsed,
              endDate: endDateParsed,
            }),
        },
      });
    });
    if (updated.status === 'ACTIVE') {
      await this.notifyVerifiedLocumsOfNewOpportunity(hostProfileId, updated);
    }
    return { success: true, job: updated };
  }

  async getApplications(
    userId: string,
    jobId: string,
    query: Record<string, unknown> = {},
  ) {
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();

    const pagination = parsePaginationParams(query, 20);
    pagination.direction = 'desc';

    const statusRaw =
      typeof query.status === 'string' ? query.status.toUpperCase() : undefined;
    const statusFilter =
      statusRaw &&
      ['APPLIED', 'SHORTLISTED', 'CONFIRMED', 'REJECTED', 'WITHDRAWN'].includes(
        statusRaw,
      )
        ? (statusRaw as 'APPLIED' | 'SHORTLISTED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN')
        : undefined;

    const page = await paginateApplications(
      this.prisma,
      { jobPostingId: jobId, status: statusFilter },
      pagination,
      {
        select: {
          id: true,
          status: true,
          locumResponse: true,
          appliedAt: true,
          placedAt: true,
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
      },
    );

    const withSignedDocs = await Promise.all(
      page.items.map(async (a) => {
        const docs = Array.isArray(a.locumProfile?.documents)
          ? a.locumProfile.documents
          : [];
        const signed = await Promise.all(
          docs.map(async (d) => ({
            ...d,
            storageUrl: await this.gcs.signedUrl(d.storageUrl),
          })),
        );
        return {
          ...a,
          locumResponse: a.locumResponse ?? null,
          locumProfile: {
            ...a.locumProfile,
            documents: signed,
          },
        };
      }),
    );

    return {
      items: withSignedDocs,
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
    };
  }

  async updateApplication(
    userId: string,
    jobId: string,
    appId: string,
    status: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED',
  ) {
    await this.assertHostCanWrite(userId);
    const hostProfileId = await this.getHostProfileId(userId);
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
      select: { hostProfileId: true, status: true, isDeleted: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.hostProfileId !== hostProfileId) throw new ForbiddenException();

    if (status === 'CONFIRMED') {
      if (job.isDeleted) {
        throw new BadRequestException(
          'This posting has been removed and cannot accept confirmations.',
        );
      }
      if (job.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Only active postings can have applicants confirmed.',
        );
      }
    }

    // PRD L2-E7.1: set placedAt when status moves to CONFIRMED
    const updated = await this.prisma.application.update({
      where: { id: appId, jobPostingId: jobId },
      data: {
        status,
        ...(status === 'CONFIRMED' && { placedAt: new Date() }),
      },
    });

    // Notify locum of status change (L-002, L-004). (No notification on SHORTLISTED.)
    try {
      const appWithDetails = await this.prisma.application.findUnique({
        where: { id: appId },
        select: {
          locumProfile: {
            select: {
              userId: true,
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          },
          jobPosting: {
            select: {
              title: true,
              startTime: true,
              endTime: true,
              hostProfile: {
                select: {
                  practiceName: true,
                  address: true,
                  city: true,
                  province: true,
                  postalCode: true,
                },
              },
            },
          },
        },
      });
      const locum = appWithDetails?.locumProfile;
      const posting = appWithDetails?.jobPosting;
      const jobTitle = posting?.title ?? 'the shift';
      if (locum?.userId && locum.user.email) {
        if (status === 'CONFIRMED') {
          const hostProfile = posting?.hostProfile;
          const clinicName = hostProfile?.practiceName ?? 'the clinic';
          const address = [
            hostProfile?.address,
            hostProfile?.city,
            hostProfile?.province,
            hostProfile?.postalCode,
          ]
            .map((s) => s?.trim())
            .filter(Boolean)
            .join(', ');
          await this.notifService.notifyLocumHostConfirmed({
            recipientId: locum.userId,
            recipientEmail: locum.user.email,
            firstName: locum.firstName,
            lastName: locum.lastName,
            jobTitle,
            clinicName,
            startTime: posting?.startTime,
            endTime: posting?.endTime,
            address: address || clinicName,
            applicationId: appId,
          });
        } else if (status === 'REJECTED') {
          await this.notifService.notifyLocumApplicationDeclined({
            recipientId: locum.userId,
            recipientEmail: locum.user.email,
            firstName: locum.firstName,
            lastName: locum.lastName,
            jobTitle,
            applicationId: appId,
          });
        }
      }
    } catch {}
    return { success: true, application: updated };
  }

  async getRecentHostAvatarUrls(limit = 3): Promise<{ avatars: string[] }> {
    const hosts = await this.prisma.user.findMany({
      where: {
        role: Role.HOST,
        status: { in: [UserStatus.ACTIVE, UserStatus.PENDING] },
        hostProfile: { isNot: null },
        avatarStoragePath: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        avatarStoragePath: true,
        updatedAt: true,
        hostProfile: {
          select: {
            updatedAt: true,
          },
        },
      },
    });

    type Candidate = { userId: string; path: string; at: number };
    const candidates: Candidate[] = [];
    for (const host of hosts) {
      const avatar = host.avatarStoragePath?.trim() ?? '';
      const profileAt = host.hostProfile?.updatedAt.getTime() ?? 0;
      const userAt = host.updatedAt.getTime();
      if (avatar) {
        candidates.push({
          userId: host.id,
          path: avatar,
          at: Math.max(userAt, profileAt),
        });
      }
    }

    candidates.sort((a, b) => b.at - a.at);
    const seenUsers = new Set<string>();
    const seenPaths = new Set<string>();
    const paths: string[] = [];
    for (const c of candidates) {
      if (seenUsers.has(c.userId) || seenPaths.has(c.path)) continue;
      seenUsers.add(c.userId);
      seenPaths.add(c.path);
      paths.push(c.path);
      if (paths.length >= limit) break;
    }

    if (paths.length < limit) {
      const extra = await this.prisma.user.findMany({
        where: {
          role: Role.HOST,
          status: { in: [UserStatus.ACTIVE, UserStatus.PENDING] },
          avatarStoragePath: { not: null },
          ...(seenUsers.size > 0 ? { id: { notIn: [...seenUsers] } } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: limit * 2,
        select: { id: true, avatarStoragePath: true },
      });
      for (const row of extra) {
        const path = row.avatarStoragePath?.trim() ?? '';
        if (!path || seenPaths.has(path) || seenUsers.has(row.id)) continue;
        seenUsers.add(row.id);
        seenPaths.add(path);
        paths.push(path);
        if (paths.length >= limit) break;
      }
    }

    const avatars: string[] = [];
    for (const path of paths) {
      const url = await this.gcs.signedUrl(path);
      if (url) avatars.push(url);
    }
    return { avatars };
  }
}
