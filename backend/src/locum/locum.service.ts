import { PushService } from '../notifications/push.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { formatAdminDoctorName } from '../notifications/admin-notification-copy.js';
import { formatLocumDoctorName } from '../notifications/notification-copy.js';
import { isShiftWithin24Hours } from '../notifications/host-notification-copy.js';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
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
  dbTimeToClockString,
  formatCalendarDateForApi,
  getPostingRequiredDates,
  isPostingFullyCovered,
  postingStatusAfterLocumAccept,
  finalizeAcceptDates,
  availabilityAfterFinalize,
  applicationClaimedDates,
  computeCoveredDates,
} from '../host/job-schedule.util.js';
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
import {
  getReviewPlaygroundEmails,
  isReviewPlaygroundEmail,
  playgroundModeForViewer,
} from '../config/review-playground.util.js';
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
  private readonly logger = new Logger(LocumService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly notifService: NotificationsService,
    private readonly adminNotif: AdminNotificationsService,
    private readonly paymentsService: PaymentsService,
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
  async countBrowseOpportunities(viewerEmail?: string | null): Promise<number> {
    return countBrowseActiveJobPostings(
      this.prisma,
      playgroundModeForViewer(viewerEmail),
    );
  }
  async browseJobs(
    query: Record<string, unknown> = {},
    options: {
      redactHostDetails?: boolean;
      viewerEmail?: string | null;
    } = {},
  ) {
    const pagination = parsePaginationParams(query, 20);
    pagination.direction = 'desc';
    const redactHostDetails = Boolean(options.redactHostDetails);
    const playgroundMode = playgroundModeForViewer(options.viewerEmail);

    const page = await paginateJobPostings(
      this.prisma,
      {
        status: 'ACTIVE',
        isDeleted: false,
        excludePassedStartDate: true,
        playgroundMode,
      },
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
        shifts: { select: { date: true, startTime: true, endTime: true } },
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
              numPhysicians: null,
              patientVol: null,
              servicesOffered: [] as string[],
              highlights: null,
            }
          : j.hostProfile;

        return {
          ...j,
          hostProfile: redactHostDetails
            ? hostProfile
            : (() => {
                const hp = hostProfile;
                const hasJobPracticeSnapshot =
                  Boolean(j.practiceType?.trim()) ||
                  Boolean(j.emr?.trim()) ||
                  Boolean(j.clinicDesc?.trim()) ||
                  Boolean(j.numPhysicians?.trim()) ||
                  Boolean(j.patientVol?.trim()) ||
                  (Array.isArray(j.servicesRequired) &&
                    j.servicesRequired.length > 0);
                return {
                  ...hp,
                  practiceType:
                    j.practiceType?.trim() || hp.practiceType || null,
                  emr: j.emr?.trim() || hp.emr || null,
                  numPhysicians: j.numPhysicians?.trim() || null,
                  patientVol: j.patientVol?.trim() || null,
                  servicesOffered: hasJobPracticeSnapshot
                    ? (j.servicesRequired ?? [])
                    : hp.servicesOffered,
                  highlights: j.clinicDesc?.trim() || hp.highlights || null,
                };
              })(),
          accommodationProvided: j.accommodationProvided,
          isDeleted: j.isDeleted,
          applicationsCount: j._count.applications,
          dates: (j.shifts ?? [])
            .map((s) => formatCalendarDateForApi(s.date))
            .filter((d): d is string => d != null)
            .sort(),
          shifts: (j.shifts ?? [])
            .map((s) => ({
              date: formatCalendarDateForApi(s.date),
              startTime: dbTimeToClockString(s.startTime),
              endTime: dbTimeToClockString(s.endTime),
            }))
            .filter((s): s is { date: string; startTime: string | null; endTime: string | null } => s.date != null)
            .sort((a, b) => a.date.localeCompare(b.date)),
        };
      }),
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
    };
  }
  async applyToJob(
    userId: string,
    jobId: string,
    opts: {
      coverNote?: string;
      availabilityKind?: 'FULL' | 'PARTIAL';
      availableDates?: string[];
    } = {},
  ) {
    const { coverNote } = opts;
    await this.assertLocumCanWrite(userId);
    const locumUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
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
      include: {
        shifts: { select: { date: true } },
        hostProfile: {
          select: { user: { select: { email: true } } },
        },
      },
    });
    if (!job) throw new NotFoundException('Job not found.');
    const playgroundEmails = getReviewPlaygroundEmails();
    const locumIsReview = isReviewPlaygroundEmail(
      locumUser?.email,
      playgroundEmails,
    );
    const hostIsReview = isReviewPlaygroundEmail(
      job.hostProfile.user.email,
      playgroundEmails,
    );
    if (locumIsReview !== hostIsReview) {
      throw new ForbiddenException('This job is not available.');
    }
    if (job.isDeleted)
      throw new BadRequestException(
        'This posting has been removed by the host.',
      );
    // A fully-covered posting is moved out of ACTIVE, so this also blocks apply
    // once every day is filled. Partially-covered postings stay ACTIVE and open.
    if (job.status !== 'ACTIVE')
      throw new BadRequestException(
        'This job is no longer accepting applications.',
      );
    const existing = await this.prisma.application.findFirst({
      where: { jobPostingId: jobId, locumProfileId: locumProfile.id },
    });
    if (existing && existing.status !== 'WITHDRAWN')
      throw new BadRequestException('You have already applied to this job.');

    // Validate declared availability against the posting's required days.
    const requiredDates = getPostingRequiredDates(job);
    const { availabilityKind, availableDates } = this.parseAvailabilityInput(
      opts,
      requiredDates,
    );

    const application = existing
      ? await this.prisma.application.update({
          where: { id: existing.id },
          data: {
            status: 'APPLIED',
            locumResponse: null,
            locumAcceptedAt: null,
            placedAt: null,
            coverNote: coverNote ?? null,
            availabilityKind,
            availableDates,
            appliedAt: new Date(),
          },
        })
      : await this.prisma.application.create({
          data: {
            jobPostingId: jobId,
            locumProfileId: locumProfile.id,
            status: 'APPLIED',
            coverNote: coverNote ?? null,
            availabilityKind,
            availableDates,
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
          recipientId: jobWithHost!.hostProfile.userId,
          recipientEmail: hostUser.email,
          locumFirstName: locum?.firstName,
          locumLastName: locum?.lastName,
          jobId,
          jobTitle: jobWithHost!.title,
          startDate: jobWithHost!.startDate,
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
              status: true,
              createdAt: true,
              publishedAt: true,
              startDate: true,
              endDate: true,
              startTime: true,
              endTime: true,
              scheduleType: true,
              payPerDay: true,
              requiredCredentials: true,
              keyResponsibilities: true,
              minYearsExperience: true,
              isRural: true,
              accommodationProvided: true,
              practiceType: true,
              emr: true,
              clinicDesc: true,
              numPhysicians: true,
              patientVol: true,
              servicesRequired: true,
              shifts: { select: { date: true, startTime: true, endTime: true } },
              hostProfile: {
                select: {
                  userId: true,
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
            },
          },
        },
      },
    );

    const pendingConfirmIds = page.items
      .filter(
        (app) =>
          app.status === 'CONFIRMED' &&
          !app.locumAcceptedAt &&
          app.locumResponse !== 'ACCEPTED',
      )
      .map((app) => app.jobPostingId);
    const acceptedByJob = new Map<
      string,
      { availabilityKind: string | null; availableDates: string[] }[]
    >();
    if (pendingConfirmIds.length > 0) {
      const acceptedOthers = await this.prisma.application.findMany({
        where: {
          jobPostingId: { in: [...new Set(pendingConfirmIds)] },
          id: { notIn: page.items.map((a) => a.id) },
          OR: [
            { locumResponse: 'ACCEPTED' },
            { locumAcceptedAt: { not: null } },
          ],
        },
        select: {
          jobPostingId: true,
          availabilityKind: true,
          availableDates: true,
        },
      });
      for (const row of acceptedOthers) {
        const list = acceptedByJob.get(row.jobPostingId) ?? [];
        list.push({
          availabilityKind: row.availabilityKind,
          availableDates: row.availableDates,
        });
        acceptedByJob.set(row.jobPostingId, list);
      }
    }

    return {
      items: page.items.map((app) => {
        const jp = (
          app as {
            jobPosting?: {
              id?: string;
              startDate?: Date | null;
              endDate?: Date | null;
              practiceType?: string | null;
              emr?: string | null;
              clinicDesc?: string | null;
              numPhysicians?: string | null;
              patientVol?: string | null;
              servicesRequired?: string[] | null;
              payPerDay?: unknown;
              hostProfile?: {
                practiceType?: string | null;
                emr?: string | null;
                servicesOffered?: string[];
                highlights?: string | null;
              };
              shifts?: { date: Date; startTime: Date | null; endTime: Date | null }[];
            };
          }
        ).jobPosting;
        const shiftRows = jp?.shifts ?? [];
        const dates = shiftRows
          .map((s) => formatCalendarDateForApi(s.date))
          .filter((d): d is string => d != null)
          .sort();
        const shifts = shiftRows
          .map((s) => ({
            date: formatCalendarDateForApi(s.date),
            startTime: dbTimeToClockString(s.startTime),
            endTime: dbTimeToClockString(s.endTime),
          }))
          .filter((s): s is { date: string; startTime: string | null; endTime: string | null } => s.date != null)
          .sort((a, b) => a.date.localeCompare(b.date));

        let acceptPreview:
          | {
              proposedDates: string[];
              takenDates: string[];
              remainingDates: string[];
            }
          | undefined;
        if (
          app.status === 'CONFIRMED' &&
          !app.locumAcceptedAt &&
          app.locumResponse !== 'ACCEPTED' &&
          jp
        ) {
          const requiredDates = getPostingRequiredDates({
            startDate: jp.startDate,
            endDate: jp.endDate,
            shifts: shiftRows,
          });
          const others = acceptedByJob.get(app.jobPostingId) ?? [];
          const proposedDates = applicationClaimedDates(
            {
              availabilityKind: app.availabilityKind,
              availableDates: app.availableDates,
            },
            requiredDates,
          );
          const remainingDates = finalizeAcceptDates(
            {
              availabilityKind: app.availabilityKind,
              availableDates: app.availableDates,
            },
            requiredDates,
            others,
          );
          const remainingSet = new Set(remainingDates);
          const takenDates = proposedDates.filter((d) => !remainingSet.has(d));
          acceptPreview = { proposedDates, takenDates, remainingDates };
        }

        const hp = jp?.hostProfile;
        const hasJobPracticeSnapshot =
          Boolean(jp?.practiceType?.trim()) ||
          Boolean(jp?.emr?.trim()) ||
          Boolean(jp?.clinicDesc?.trim()) ||
          Boolean(jp?.numPhysicians?.trim()) ||
          Boolean(jp?.patientVol?.trim()) ||
          (Array.isArray(jp?.servicesRequired) &&
            (jp?.servicesRequired?.length ?? 0) > 0);
        const hostProfile = hp
          ? {
              ...hp,
              practiceType: jp?.practiceType?.trim() || hp.practiceType || null,
              emr: jp?.emr?.trim() || hp.emr || null,
              numPhysicians: jp?.numPhysicians?.trim() || null,
              patientVol: jp?.patientVol?.trim() || null,
              servicesOffered: hasJobPracticeSnapshot
                ? (jp?.servicesRequired ?? [])
                : (hp.servicesOffered ?? []),
              highlights: jp?.clinicDesc?.trim() || hp.highlights || null,
            }
          : undefined;

        return {
          ...app,
          ...(acceptPreview ? { acceptPreview } : {}),
          ...(jp
            ? {
                jobPosting: {
                  ...jp,
                  dates,
                  shifts,
                  payPerDay:
                    jp.payPerDay != null ? Number(jp.payPerDay) : null,
                  ...(hostProfile ? { hostProfile } : {}),
                  location: [hostProfile?.city, hostProfile?.province]
                    .filter(Boolean)
                    .join(', '),
                },
              }
            : {}),
        };
      }),
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

  private parseAvailabilityInput(
    opts: {
      availabilityKind?: 'FULL' | 'PARTIAL';
      availableDates?: string[];
    },
    requiredDates: string[],
  ): { availabilityKind: 'FULL' | 'PARTIAL'; availableDates: string[] } {
    const isPartial = opts.availabilityKind === 'PARTIAL';
    if (!isPartial) {
      return { availabilityKind: 'FULL', availableDates: [] };
    }
    const requiredSet = new Set(requiredDates);
    const picked = [
      ...new Set(
        (opts.availableDates ?? [])
          .map((d) => d.slice(0, 10))
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      ),
    ].sort();
    if (picked.length === 0) {
      throw new BadRequestException(
        'Select at least one day you are available for.',
      );
    }
    if (requiredDates.length > 0 && picked.some((d) => !requiredSet.has(d))) {
      throw new BadRequestException(
        'Selected days must be within the posting schedule.',
      );
    }
    return { availabilityKind: 'PARTIAL', availableDates: picked };
  }

  /** Withdraw / edit availability allowed until the posting is ongoing or finished. */
  private assertApplicationMutableBeforeOngoing(posting: {
    status: string;
    isDeleted: boolean;
  }) {
    if (posting.isDeleted) {
      throw new BadRequestException('This posting has been removed by the host.');
    }
    if (posting.status === 'ONGOING' || posting.status === 'COMPLETED') {
      throw new BadRequestException(
        'This shift has already started or finished. Contact the host if you need help.',
      );
    }
    if (posting.status === 'EXPIRED') {
      throw new BadRequestException('This posting has expired.');
    }
  }

  private async notifyHostOfWithdrawal(params: {
    userId: string;
    applicationId: string;
    jobPostingId: string;
    wasAccepted: boolean;
  }) {
    try {
      const jobWithHost = await this.prisma.jobPosting.findUnique({
        where: { id: params.jobPostingId },
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
        where: { userId: params.userId },
        select: { firstName: true, lastName: true },
      });
      const host = jobWithHost?.hostProfile;
      const hostEmail = host?.user?.email;
      if (!host?.userId || !hostEmail || !jobWithHost) return;

      const reason = params.wasAccepted
        ? 'Locum withdrew after accepting the placement'
        : 'Locum withdrew their application';

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
          reason,
          jobId: jobWithHost.id,
        });
      } else {
        await this.notifService.notifyHostLocumDeclined({
          recipientId: host.userId,
          recipientEmail: hostEmail,
          locumFirstName: locumProfile?.firstName,
          locumLastName: locumProfile?.lastName,
          startDate: jobWithHost.startDate,
          applicationId: params.applicationId,
          jobId: jobWithHost.id,
        });
      }
    } catch {}
  }

  async updateApplicationAvailability(
    userId: string,
    applicationId: string,
    opts: {
      availabilityKind: 'FULL' | 'PARTIAL';
      availableDates?: string[];
    },
  ) {
    await this.assertLocumCanWrite(userId);
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!locumProfile) throw new ForbiddenException();

    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, locumProfileId: locumProfile.id },
      include: {
        jobPosting: {
          select: {
            id: true,
            title: true,
            status: true,
            isDeleted: true,
            startDate: true,
            endDate: true,
            shifts: { select: { date: true } },
            hostProfile: {
              select: {
                userId: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status === 'WITHDRAWN' || app.status === 'REJECTED') {
      throw new BadRequestException(
        'This application is closed and cannot be updated.',
      );
    }
    this.assertApplicationMutableBeforeOngoing(app.jobPosting);

    const requiredDates = getPostingRequiredDates(app.jobPosting);
    const { availabilityKind, availableDates } = this.parseAvailabilityInput(
      opts,
      requiredDates,
    );

    // If already accepted, shrinking days must not leave zero days claimed.
    const wasAccepted =
      app.locumResponse === 'ACCEPTED' || app.locumAcceptedAt != null;
    if (wasAccepted && availabilityKind === 'PARTIAL') {
      // Dropping all days is a withdraw — force that path instead.
      if (availableDates.length === 0) {
        throw new BadRequestException(
          'Select at least one day, or withdraw from this placement.',
        );
      }
    }

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: { availabilityKind, availableDates },
    });

    // Recalculate coverage if this locum was already counting toward fill.
    if (wasAccepted) {
      await this.applyCoverageStatus(app.jobPostingId);
    }

    try {
      const host = app.jobPosting.hostProfile;
      const hostEmail = host?.user?.email;
      if (host?.userId && hostEmail) {
        await this.notifService.notifyHostAvailabilityUpdated({
          recipientId: host.userId,
          recipientEmail: hostEmail,
          locumFirstName: locumProfile.firstName,
          locumLastName: locumProfile.lastName,
          jobId: app.jobPosting.id,
          jobTitle: app.jobPosting.title,
          applicationId,
          availabilityKind,
          dayCount:
            availabilityKind === 'FULL'
              ? requiredDates.length || 0
              : availableDates.length,
        });
      }
    } catch {}

    return { success: true, application: updated };
  }

  async withdrawApplication(userId: string, applicationId: string) {
    await this.assertLocumCanWrite(userId);
    const locumProfile = await this.prisma.locumProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!locumProfile) throw new ForbiddenException();

    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, locumProfileId: locumProfile.id },
      include: {
        jobPosting: {
          select: {
            id: true,
            status: true,
            isDeleted: true,
            startDate: true,
          },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status === 'WITHDRAWN') {
      return { success: true, alreadyWithdrawn: true };
    }
    if (app.status === 'REJECTED') {
      throw new BadRequestException('This application was already closed.');
    }
    this.assertApplicationMutableBeforeOngoing(app.jobPosting);

    const wasAccepted =
      app.locumResponse === 'ACCEPTED' || app.locumAcceptedAt != null;

    await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'WITHDRAWN',
        locumResponse: wasAccepted || app.status === 'CONFIRMED'
          ? 'REJECTED'
          : app.locumResponse,
        locumAcceptedAt: null,
      },
    });

    // Soft-reopen posting when accepted coverage is no longer complete.
    await this.applyCoverageStatus(app.jobPostingId);

    if (wasAccepted) {
      try {
        await this.paymentsService.handleCancellation({
          applicationId,
          cancelledBy: 'LOCUM',
        });
      } catch {}
    }

    await this.notifyHostOfWithdrawal({
      userId,
      applicationId,
      jobPostingId: app.jobPostingId,
      wasAccepted,
    });

    return { success: true, reopened: wasAccepted };
  }

  /**
   * Recompute a posting's status from the coverage of its accepted applications.
   * Fully covered -> promote an ACTIVE posting to SCHEDULED/ONGOING/COMPLETED (so
   * it leaves browse); not fully covered -> reopen a filled posting back to ACTIVE
   * so remaining days can still be applied for. Terminal states are left alone.
   */
  private async applyCoverageStatus(jobPostingId: string): Promise<void> {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { id: jobPostingId },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        shifts: { select: { date: true } },
        applications: {
          where: {
            OR: [
              { locumResponse: 'ACCEPTED' },
              { locumAcceptedAt: { not: null } },
            ],
          },
          select: { availabilityKind: true, availableDates: true },
        },
      },
    });
    if (!posting) return;
    const covered = isPostingFullyCovered(posting, posting.applications);
    if (covered) {
      if (posting.status === 'ACTIVE') {
        await this.prisma.jobPosting.update({
          where: { id: jobPostingId },
          data: {
            status: postingStatusAfterLocumAccept(
              posting.startDate,
              posting.endDate,
            ),
          },
        });
      }
    } else if (
      posting.status === 'SCHEDULED' ||
      posting.status === 'ONGOING'
    ) {
      await this.prisma.jobPosting.update({
        where: { id: jobPostingId },
        data: { status: 'ACTIVE' },
      });
    }
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
      include: {
        jobPosting: {
          select: {
            id: true,
            status: true,
            isDeleted: true,
            startDate: true,
            endDate: true,
          },
        },
      },
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

      // First to accept wins overlapping days: finalize against already-accepted coverage.
      const postingForCoverage = await this.prisma.jobPosting.findUnique({
        where: { id: app.jobPostingId },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          shifts: { select: { date: true } },
          applications: {
            where: {
              id: { not: applicationId },
              OR: [
                { locumResponse: 'ACCEPTED' },
                { locumAcceptedAt: { not: null } },
              ],
            },
            select: {
              id: true,
              availabilityKind: true,
              availableDates: true,
            },
          },
        },
      });
      if (!postingForCoverage) throw new NotFoundException('Job not found');
      const requiredDates = getPostingRequiredDates(postingForCoverage);
      const finalizedDates = finalizeAcceptDates(
        {
          availabilityKind: app.availabilityKind,
          availableDates: app.availableDates,
        },
        requiredDates,
        postingForCoverage.applications,
      );
      if (requiredDates.length > 0 && finalizedDates.length === 0) {
        throw new BadRequestException(
          'No remaining days are available on this posting. Another locum already accepted the overlapping dates.',
        );
      }
      const availability =
        requiredDates.length === 0
          ? {
              availabilityKind: (app.availabilityKind === 'PARTIAL'
                ? 'PARTIAL'
                : 'FULL') as 'FULL' | 'PARTIAL',
              availableDates: app.availableDates ?? [],
            }
          : availabilityAfterFinalize(
              requiredDates,
              finalizedDates,
              app.availabilityKind,
            );

      await this.prisma.application.update({
        where: { id: applicationId },
        data: {
          locumAcceptedAt: new Date(),
          locumResponse: 'ACCEPTED',
          availabilityKind: availability.availabilityKind,
          availableDates: availability.availableDates,
        },
      });

      // Trim other host-confirmed (not yet accepted) locums off days just taken.
      const taken = computeCoveredDates(
        [
          ...postingForCoverage.applications,
          {
            availabilityKind: availability.availabilityKind,
            availableDates: availability.availableDates,
          },
        ],
        requiredDates,
      );
      const pendingConfirmed = await this.prisma.application.findMany({
        where: {
          jobPostingId: app.jobPostingId,
          id: { not: applicationId },
          status: 'CONFIRMED',
          locumAcceptedAt: null,
        },
        select: {
          id: true,
          availabilityKind: true,
          availableDates: true,
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
      for (const other of pendingConfirmed) {
        const claimed = applicationClaimedDates(other, requiredDates);
        const remaining = claimed.filter((d) => !taken.has(d));
        if (remaining.length === claimed.length) continue;
        if (remaining.length === 0) {
          await this.prisma.application.update({
            where: { id: other.id },
            data: {
              status: 'WITHDRAWN',
              locumResponse: 'REJECTED',
              availableDates: [],
            },
          });
          try {
            const email = other.locumProfile.user.email;
            if (email) {
              await this.notifService.notifyLocumPlacementDates({
                recipientId: other.locumProfile.userId,
                recipientEmail: email,
                jobTitle: postingForCoverage.title,
                dates: [],
                kind: 'cleared',
                applicationId: other.id,
              });
            }
          } catch {}
        } else {
          const trimmed = availabilityAfterFinalize(
            requiredDates,
            remaining,
            other.availabilityKind,
          );
          await this.prisma.application.update({
            where: { id: other.id },
            data: {
              availabilityKind: trimmed.availabilityKind,
              availableDates: trimmed.availableDates,
            },
          });
          try {
            const email = other.locumProfile.user.email;
            if (email) {
              await this.notifService.notifyLocumPlacementDates({
                recipientId: other.locumProfile.userId,
                recipientEmail: email,
                jobTitle: postingForCoverage.title,
                dates: remaining,
                kind: 'updated',
                applicationId: other.id,
              });
            }
          } catch {}
        }
      }

      // Only fill/close the posting once accepted locums cover every day.
      await this.applyCoverageStatus(app.jobPostingId);

      try {
        await this.paymentsService.createMatchFeeInvoice(applicationId);
      } catch (err) {
        this.logger.warn(
          `Match fee invoice after accept failed for ${applicationId}: ${err instanceof Error ? err.message : err}`,
        );
      }

      try {
        const email = (
          await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          })
        )?.email;
        if (email) {
          await this.notifService.notifyLocumMatchFeeInfo({
            recipientId: userId,
            recipientEmail: email,
            jobTitle: postingForCoverage.title,
            applicationId,
          });
        }
      } catch {}

      try {
        const email = (
          await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          })
        )?.email;
        if (email && finalizedDates.length > 0) {
          await this.notifService.notifyLocumPlacementDates({
            recipientId: userId,
            recipientEmail: email,
            jobTitle: postingForCoverage.title,
            dates: finalizedDates,
            kind: 'finalized',
            applicationId,
          });
        }
      } catch {}

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
      return {
        success: true,
        finalizedDates:
          requiredDates.length === 0 ? undefined : finalizedDates,
      };
    }
    if (app.locumAcceptedAt)
      throw new BadRequestException('You already accepted this placement.');
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { status: 'WITHDRAWN', locumResponse: 'REJECTED' },
    });
    // Reopen the posting if the remaining accepted locums no longer cover it.
    await this.applyCoverageStatus(app.jobPostingId);
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
