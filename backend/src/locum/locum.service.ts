import { PushService } from '../notifications/push.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import { formatAdminDoctorName } from '../notifications/admin-notification-copy.js';
import { formatLocumDoctorName } from '../notifications/notification-copy.js';
import { isShiftWithin24Hours } from '../notifications/host-notification-copy.js';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DocumentType,
  Specialty,
  UserStatus,
  VerificationStatus,
  type LocumProfile as LocumProfileRow,
  type User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertOwnsStoragePath } from '../common/utils/storage-path.util.js';
import {
  paginateJobPostings,
  paginateApplications,
  parsePaginationParams,
  countBrowseActiveJobPostings,
} from '../common/pagination/index.js';
import {
  adminCpsnsNumberOrEmpty,
  isCpsnsVerificationApproved,
  normalizeCpsns,
  credentialReviewPatchOnProfileSave,
  didCpsnsDocumentChange,
  didCpsnsNumberChange,
  mergeCredentialReviewPatchForAccountPending,
  mergeCredentialSubmittedAtPatch,
} from '../cpsns/cpsns-verified.js';
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
  const n = (k: string): number | undefined => {
    const raw = body[k];
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
    const str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!str) return undefined;
    const parsed = Number(str);
    if (!Number.isFinite(parsed)) return undefined;
    const int = Math.trunc(parsed);
    if (int < 0) return undefined;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly notifService: NotificationsService,
    private readonly adminNotif: AdminNotificationsService,
  ) {}

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
    const spec =
      profile.specializationText?.trim() ||
      specialtyToDisplay(profile.specialty);
    return {
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      cpsnsNumber: adminCpsnsNumberOrEmpty(profile.cpsnsId) || undefined,
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
    const cpsnsId = cpsnsDigits || pendingFallback;
    if (cpsnsDigits) {
      const taken = await this.prisma.locumProfile.findFirst({
        where: { cpsnsId: cpsnsDigits, userId: { not: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new BadRequestException(
          'This CPSNS number is already registered to another account.',
        );
      }
    }
    const specialty = mapSpecialty(dto.specialization);
    const summary = dto.professionalSummary?.trim() || null;
    const specializationText = dto.specialization?.trim() || null;
    const yearsOfExperience =
      dto.yearsOfExperience === undefined ? null : dto.yearsOfExperience;
    const [existing, account] = await Promise.all([
      this.prisma.locumProfile.findUnique({
        where: { userId },
        select: {
          cpsnsId: true,
          cpsnsVerificationStatus: true,
          licenseFileName: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true },
      }),
    ]);
    const profileSubmittedForReview = Boolean(
      dto.licenseFileName?.trim() ||
      dto.resumeFileName?.trim() ||
      dto.firstName?.trim() ||
      dto.lastName?.trim(),
    );
    const verificationPatch = mergeCredentialSubmittedAtPatch(
      existing?.cpsnsVerificationStatus,
      mergeCredentialReviewPatchForAccountPending(
        existing
          ? {
              cpsnsNumber: existing.cpsnsId,
              cpsnsVerificationStatus: existing.cpsnsVerificationStatus,
            }
          : null,
        credentialReviewPatchOnProfileSave(
          existing
            ? {
                cpsnsNumber: existing.cpsnsId,
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
        ...(cpsnsDigits ? { cpsnsId: cpsnsDigits } : {}),
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
    await Promise.all(
      docInputs.map(async (d) => {
        await this.prisma.document.deleteMany({
          where: { locumProfileId: profile.id, documentType: d.type },
        });
        if (!d.storageUrl) return;
        assertOwnsStoragePath(d.storageUrl, userId);
        const fileName =
          d.displayName || d.storageUrl.split('/').pop() || d.storageUrl;
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
      }),
    );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, suspensionNote: true, suspendedAt: true },
    });

    const doctorName = formatAdminDoctorName(
      dto.firstName,
      dto.lastName,
      'Locum physician',
    );
    const cpsnsNumberChanged = didCpsnsNumberChange(
      existing?.cpsnsId,
      cpsnsDigits,
    );
    const cpsnsLicenseChanged = didCpsnsDocumentChange(
      existing?.licenseFileName,
      dto.licenseFileName,
    );
    try {
      if (cpsnsNumberChanged) {
        await this.adminNotif.notifyCpsnsUpdated({
          doctorName,
          changeType: 'number',
          profileId: profile.id,
          profileType: 'LocumProfile',
        });
      }
      if (cpsnsLicenseChanged) {
        await this.adminNotif.notifyCpsnsUpdated({
          doctorName,
          changeType: 'document',
          profileId: profile.id,
          profileType: 'LocumProfile',
        });
      }
      const skipGenericCredential =
        cpsnsNumberChanged || cpsnsLicenseChanged;
      if (profileSubmittedForReview && !skipGenericCredential) {
        const credentialType = dto.resumeFileName?.trim()
          ? 'resume documents'
          : 'credentials';
        await this.adminNotif.notifyCredentialUploaded({
          doctorName,
          credentialType,
          profileId: profile.id,
          profileType: 'LocumProfile',
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
    return countBrowseActiveJobPostings(this.prisma);
  }
  async browseJobs(
    query: Record<string, unknown> = {},
    options: { redactHostDetails?: boolean } = {},
  ) {
    const pagination = parsePaginationParams(query, 20);
    pagination.direction = 'desc';
    const redactHostDetails = Boolean(options.redactHostDetails);

    const page = await paginateJobPostings(
      this.prisma,
      { status: 'ACTIVE', isDeleted: false, excludePassedStartDate: true },
      pagination,
      {
        hostProfile: {
          select: {
            practiceName: true,
            contactFirstName: true,
            contactLastName: true,
            cpsnsVerificationStatus: true,
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
    );

    return {
      items: page.items.map((j) => {
        const hostProfile = redactHostDetails
          ? {
              city: j.hostProfile.city,
              province: j.hostProfile.province,
              // Keep shape stable for the frontend; omit identifying fields.
              practiceName: '',
              contactFirstName: null,
              contactLastName: null,
              cpsnsVerificationStatus: null,
              postalCode: null,
              address: null,
              address1: null,
              practiceType: null,
              emr: null,
              servicesOffered: [] as string[],
              highlights: null,
            }
          : j.hostProfile;

        return {
          ...j,
          hostProfile,
          isDeleted: j.isDeleted,
          applicationsCount: j._count.applications,
        };
      }),
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
    };
  }
  async applyToJob(userId: string, jobId: string, coverNote?: string) {
    await this.assertLocumCanWrite(userId);
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true, cpsnsVerificationStatus: true },
    });
    if (!locumProfile)
      throw new NotFoundException(
        'Complete your profile before applying to jobs.',
      );
    if (!isCpsnsVerificationApproved(locumProfile.cpsnsVerificationStatus)) {
      throw new BadRequestException(
        'Your CPSNS must be verified by an administrator before you can apply to jobs.',
      );
    }
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found.');
    if (job.isDeleted)
      throw new BadRequestException(
        'This posting has been removed by the host.',
      );
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
    // H-001: Notify host of new application
    try {
      const jobWithHost = await this.prisma.jobPosting.findUnique({
        where: { id: jobId },
        select: {
          title: true,
          startDate: true,
          hostProfile: {
            select: {
              userId: true,
              user: { select: { email: true } },
            },
          },
        },
      });
      const hostUser = jobWithHost?.hostProfile?.user;
      if (hostUser?.email) {
        const locum = await this.prisma.locumProfile.findUnique({
          where: { userId },
          select: { firstName: true, lastName: true },
        });
        await this.notifService.notifyHostLocumApplied({
          recipientId: jobWithHost.hostProfile.userId,
          recipientEmail: hostUser.email,
          locumFirstName: locum?.firstName,
          locumLastName: locum?.lastName,
          jobId,
          jobTitle: jobWithHost.title,
          startDate: jobWithHost.startDate,
          applicationId: application.id,
        });
      }
    } catch {}
    return { success: true, application };
  }
  async getMyApplications(userId: string, query: Record<string, unknown> = {}) {
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!locumProfile) {
      return { items: [], nextCursor: null, hasNextPage: false };
    }

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
      { locumProfileId: locumProfile.id, status: statusFilter },
      pagination,
      {
        include: {
          jobPosting: {
            select: {
              id: true,
              title: true,
              description: true,
              isDeleted: true,
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
      },
    );

    return {
      items: page.items,
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
    };
  }
  async getDashboardStats(userId: string) {
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!locumProfile) {
      return { totalAcceptedShifts: 0, completedShifts: 0 };
    }
    const now = new Date();
    const locumAcceptedWhere = {
      locumProfileId: locumProfile.id,
      OR: [
        { locumResponse: 'ACCEPTED' as const },
        { locumAcceptedAt: { not: null } },
      ],
    };
    const [totalAcceptedShifts, completedShifts] = await Promise.all([
      this.prisma.application.count({ where: locumAcceptedWhere }),
      this.prisma.application.count({
        where: {
          ...locumAcceptedWhere,
          jobPosting: {
            OR: [{ endDate: { lt: now } }, { status: 'COMPLETED' }],
          },
        },
      }),
    ]);
    return { totalAcceptedShifts, completedShifts };
  }
  async respondToConfirmedPlacement(
    userId: string,
    applicationId: string,
    response: 'accept' | 'decline',
  ) {
    if (response !== 'accept' && response !== 'decline')
      throw new BadRequestException('Choose accept or decline.');
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!locumProfile) throw new ForbiddenException();
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, locumProfileId: locumProfile.id },
      include: { jobPosting: { select: { id: true, status: true, isDeleted: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'CONFIRMED')
      throw new BadRequestException(
        'Only host-confirmed placements can be accepted or declined.',
      );
    if (app.jobPosting.isDeleted)
      throw new BadRequestException('This posting has been removed by the host.');
    if (response === 'accept') {
      if (app.jobPosting.status !== 'ACTIVE') {
        throw new BadRequestException(
          'This posting is no longer active and cannot be accepted.',
        );
      }
      if (app.locumAcceptedAt)
        throw new BadRequestException(
          'You have already accepted this placement.',
        );
      await this.prisma.application.update({
        where: { id: applicationId },
        data: { locumAcceptedAt: new Date(), locumResponse: 'ACCEPTED' },
      });
      await this.prisma.jobPosting.update({
        where: { id: app.jobPostingId },
        data: { status: 'ONGOING' },
      });
      // H-002: Notify host that locum accepted
      try {
        const jobWithHost = await this.prisma.jobPosting.findUnique({
          where: { id: app.jobPostingId },
          select: {
            startDate: true,
            hostProfile: {
              select: {
                userId: true,
                user: { select: { email: true } },
              },
            },
          },
        });
        const locumProfile = await this.prisma.locumProfile.findUnique({
          where: { userId },
          select: { firstName: true, lastName: true },
        });
        const hostEmail = jobWithHost?.hostProfile?.user?.email;
        if (jobWithHost?.hostProfile?.userId && hostEmail) {
          await this.notifService.notifyHostLocumAccepted({
            recipientId: jobWithHost.hostProfile.userId,
            recipientEmail: hostEmail,
            locumFirstName: locumProfile?.firstName,
            locumLastName: locumProfile?.lastName,
            startDate: jobWithHost.startDate,
            applicationId,
          });
        }
      } catch {}
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
    // H-009 when shift is within 24h; otherwise H-003 (Application Update).
    try {
      const jobWithHost = await this.prisma.jobPosting.findUnique({
        where: { id: app.jobPostingId },
        select: {
          id: true,
          startDate: true,
          hostProfile: {
            select: {
              userId: true,
              practiceName: true,
              user: { select: { email: true } },
            },
          },
        },
      });
      const locumProfile = await this.prisma.locumProfile.findUnique({
        where: { userId },
        select: { firstName: true, lastName: true },
      });
      const host = jobWithHost?.hostProfile;
      const hostEmail = host?.user?.email;
      if (host?.userId && hostEmail && jobWithHost) {
        if (isShiftWithin24Hours(jobWithHost.startDate)) {
          await this.notifService.notifyHostShiftCancelled({
            recipientId: host.userId,
            recipientEmail: hostEmail,
            startDate: jobWithHost.startDate,
            clinicName: host.practiceName ?? 'the clinic',
            cancelledBy: formatLocumDoctorName(
              locumProfile?.firstName,
              locumProfile?.lastName,
            ),
            reason: 'Locum declined the confirmed placement',
            jobId: jobWithHost.id,
          });
        } else {
          await this.notifService.notifyHostLocumDeclined({
            recipientId: host.userId,
            recipientEmail: hostEmail,
            locumFirstName: locumProfile?.firstName,
            locumLastName: locumProfile?.lastName,
            startDate: jobWithHost.startDate,
            applicationId,
            jobId: jobWithHost.id,
          });
        }
      }
    } catch {}
    return { success: true };
  }
}
