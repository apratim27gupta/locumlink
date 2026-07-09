import { PushService } from '../notifications/push.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AuditAction,
  PostingStatus,
  Role,
  UserReportStatus,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import { GcsService } from '../gcs/gcs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminJwtPayload } from '../admin-auth/admin-auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import type { AdminUpdateVerificationDto } from './dto/admin-update-verification.dto.js';
import type { AdminReportActionDto } from './dto/admin-report-action.dto.js';
import {
  analyticsSummaryToCsv,
  buildAnalyticsSummary,
  type AnalyticsSummary,
} from './admin-analytics.js';
import {
  credentialQueueSubmittedAt,
  formatAdminCpsnsDisplay,
  isEligibleForCredentialQueueHost,
  isEligibleForCredentialQueueLocum,
  mergeCredentialSubmittedAtPatch,
} from '../cpsns/cpsns-verified.js';
const VERIFICATION_PENDING_FILTER: VerificationStatus[] = [
  VerificationStatus.UNVERIFIED,
  VerificationStatus.PENDING_REVIEW,
];

/** Matches VerificationStatus enum values in schema (avoids enum-as-namespace in type positions). */
type VerificationListFilter = 'PENDING_TAB' | 'VERIFIED' | 'REJECTED';

const reportUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  locumProfile: { select: { firstName: true, lastName: true } },
  hostProfile: {
    select: {
      contactFirstName: true,
      contactLastName: true,
      practiceName: true,
    },
  },
} as const;

function formatAuditDetail(params: {
  before?: unknown;
  after?: unknown;
}): string {
  const before = params.before;
  const after = params.after;
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    const parts: string[] = [];
    for (const k of keys) {
      const bv = JSON.stringify(b[k]);
      const av = JSON.stringify(a[k]);
      if (bv !== av) parts.push(`${k}: ${bv} → ${av}`);
    }
    if (parts.length) return parts.join('; ');
  }
  if (typeof after === 'object' && after !== null) return JSON.stringify(after);
  return '';
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gcs: GcsService,
    private readonly pushService: PushService,
    private readonly notifService: NotificationsService,
  ) {}

  private cpsnsProfileField(
    value: string | null | undefined,
  ): { label: string; value: string } {
    return { label: 'CPSNS', value: formatAdminCpsnsDisplay(value) };
  }

  private profileField(
    label: string,
    value: unknown,
  ): { label: string; value: string } | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s) return null;
    return { label, value: s };
  }

  private reportUserSummary(user: {
    id: string;
    email: string;
    role: Role;
    status: UserStatus;
    locumProfile?: { firstName: string | null; lastName: string | null } | null;
    hostProfile?: {
      contactFirstName: string | null;
      contactLastName: string | null;
      practiceName: string | null;
    } | null;
  }) {
    const locumName = [
      user.locumProfile?.firstName,
      user.locumProfile?.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    const hostContact = [
      user.hostProfile?.contactFirstName,
      user.hostProfile?.contactLastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      name: user.hostProfile?.practiceName || locumName || hostContact || user.email,
    };
  }

  private async verificationDocument(
    id: string,
    label: string,
    storagePath: string | null | undefined,
    displayName: string | null | undefined,
  ): Promise<{
    id: string;
    label: string;
    fileName: string;
    signedUrl: string;
  } | null> {
    const path = storagePath?.trim();
    if (!path) return null;
    const fileName = displayName?.trim() || path.split('/').pop() || label;
    const signedUrl = await this.gcs.signedUrl(path);
    if (!signedUrl) return null;
    return { id, label, fileName, signedUrl };
  }

  async stats(): Promise<{
    totalUsers: number;
    hostUsers: number;
    locumUsers: number;
    verifiedHostUsers: number;
    verifiedLocumUsers: number;
    pendingVerifications: number;
    activeJobPostings: number;
    totalJobPostings: number;
    totalApplications: number;
    fillRate: number;
    avgTimesToPlacementHours: number | null;
    openReports: number;
  }> {
    const [
      roleGroups,
      verifiedHostUsers,
      verifiedLocumUsers,
      pendingLocumVerifications,
      pendingHostVerifications,
      activeJobPostings,
      totalJobPostings,
      totalApplications,
      confirmedApplications,
      placedApplications,
      openReports,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      this.prisma.hostProfile.count({
        where: {
          cpsnsVerificationStatus: VerificationStatus.VERIFIED,
          user: { role: Role.HOST },
        },
      }),
      this.prisma.locumProfile.count({
        where: {
          cpsnsVerificationStatus: VerificationStatus.VERIFIED,
          user: { role: Role.LOCUM },
        },
      }),
      this.prisma.locumProfile.count({
        where: { cpsnsVerificationStatus: { in: VERIFICATION_PENDING_FILTER } },
      }),
      this.prisma.hostProfile.count({
        where: { cpsnsVerificationStatus: { in: VERIFICATION_PENDING_FILTER } },
      }),
      this.prisma.jobPosting.count({
        where: { status: PostingStatus.ACTIVE, isDeleted: false },
      }),
      this.prisma.jobPosting.count({ where: { isDeleted: false } }),
      this.prisma.application.count(),
      this.prisma.application.count({
        where: { status: 'CONFIRMED' },
      }),
      // For avg time-to-placement: get confirmed apps with placedAt set
      this.prisma.application.findMany({
        where: {
          status: 'CONFIRMED',
          placedAt: { not: null },
        },
        select: { appliedAt: true, placedAt: true },
        take: 1000,
      }),
      this.prisma.userReport.count({
        where: { status: UserReportStatus.OPEN },
      }),
    ]);

    let hostUsers = 0;
    let locumUsers = 0;
    let totalUsers = 0;
    for (const g of roleGroups) {
      totalUsers += g._count.id;
      if (g.role === Role.HOST) hostUsers = g._count.id;
      if (g.role === Role.LOCUM) locumUsers = g._count.id;
    }

    const pendingVerifications =
      pendingLocumVerifications + pendingHostVerifications;

    // Fill rate: confirmed / total applications * 100
    const fillRate =
      totalApplications > 0
        ? Math.round((confirmedApplications / totalApplications) * 100)
        : 0;

    // Avg time-to-placement in hours
    let avgTimesToPlacementHours: number | null = null;
    if (placedApplications.length > 0) {
      const totalMs = placedApplications.reduce((sum, a) => {
        const placed = a.placedAt ? new Date(a.placedAt).getTime() : 0;
        const applied = new Date(a.appliedAt).getTime();
        return sum + (placed - applied);
      }, 0);
      avgTimesToPlacementHours =
        Math.round((totalMs / placedApplications.length / 3600000) * 10) / 10;
    }

    return {
      totalUsers,
      hostUsers,
      locumUsers,
      verifiedHostUsers,
      verifiedLocumUsers,
      pendingVerifications,
      activeJobPostings,
      totalJobPostings,
      totalApplications,
      fillRate,
      avgTimesToPlacementHours,
      openReports,
    };
  }

  async analyticsSummary(): Promise<AnalyticsSummary> {
    return buildAnalyticsSummary(this.prisma);
  }

  async exportAnalyticsCsv(
    req: Request,
    admin: AdminJwtPayload,
  ): Promise<string> {
    const summary = await buildAnalyticsSummary(this.prisma);
    this.audit.log({
      adminActorId: admin.sub,
      action: AuditAction.EXPORT,
      entity: 'AnalyticsReport',
      endpoint: '/api/admin/analytics/export',
      ip: extractIp(req),
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : undefined,
      actorRole: 'ADMIN',
    });
    return analyticsSummaryToCsv(summary);
  }

  async listUsers(params: { q?: string; page: number; pageSize: number }) {
    const skip = Math.max(0, (params.page - 1) * params.pageSize);
    const q = params.q?.trim();
    const where = q
      ? { email: { contains: q, mode: 'insensitive' as const } }
      : undefined;
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.pageSize,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          suspensionNote: true,
          suspendedAt: true,
          locumProfile: {
            select: {
              cpsnsVerificationStatus: true,
              cpsnsId: true,
              licenseFileName: true,
              resumeFileName: true,
              firstName: true,
              lastName: true,
            },
          },
          hostProfile: {
            select: {
              cpsnsVerificationStatus: true,
              cpsnsNumber: true,
              practiceName: true,
              licenseFile: true,
              photoIdFile: true,
            },
          },
        },
      }),
    ]);
    return {
      total,
      page: params.page,
      pageSize: params.pageSize,
      users: users.map((u) => {
        const cpsnsVerificationStatus =
          u.role === Role.LOCUM
            ? (u.locumProfile?.cpsnsVerificationStatus ?? null)
            : u.role === Role.HOST
              ? (u.hostProfile?.cpsnsVerificationStatus ?? null)
              : null;
        const inCredentialQueue =
          u.role === Role.LOCUM && u.locumProfile
            ? isEligibleForCredentialQueueLocum(u.locumProfile)
            : u.role === Role.HOST && u.hostProfile
              ? isEligibleForCredentialQueueHost(u.hostProfile)
              : false;

        return {
          id: u.id,
          email: u.email,
          role: u.role,
          status: u.status,
          cpsnsVerificationStatus,
          inCredentialQueue,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt
            ? u.lastLoginAt.toISOString().slice(0, 10)
            : null,
          suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
        };
      }),
    };
  }

  async exportUsersCsv(q?: string): Promise<string> {
    const where = q?.trim()
      ? { email: { contains: q.trim(), mode: 'insensitive' as const } }
      : undefined;
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        suspensionNote: true,
      },
    });
    const header = [
      'id',
      'email',
      'role',
      'status',
      'createdAt',
      'lastLoginAt',
      'suspensionNote',
    ].join(',');
    const lines = users.map((u) =>
      [
        u.id,
        csvEscape(u.email),
        u.role,
        u.status,
        u.createdAt.toISOString(),
        u.lastLoginAt?.toISOString() ?? '',
        csvEscape(u.suspensionNote ?? ''),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  async listReports(params: { status?: string }) {
    const status =
      params.status &&
      ['OPEN', 'DISMISSED', 'WARNED', 'SUSPENDED'].includes(params.status)
        ? (params.status as UserReportStatus)
        : UserReportStatus.OPEN;
    const rows = await this.prisma.userReport.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        reporter: { select: reportUserSelect },
        reported: { select: reportUserSelect },
        reviewedBy: { select: { id: true, email: true, name: true } },
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        alsoBlockedReporter: row.alsoBlockedReporter,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        warningNote: row.warningNote,
        reporter: this.reportUserSummary(row.reporter),
        reported: this.reportUserSummary(row.reported),
        reviewedBy: row.reviewedBy,
      })),
    };
  }

  async getReport(reportId: string) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: reportUserSelect },
        reported: { select: reportUserSelect },
        reviewedBy: { select: { id: true, email: true, name: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    const newestMessages = await this.prisma.message.findMany({
      where: {
        deletedAt: null,
        OR: [
          { senderId: report.reporterId, recipientId: report.reportedId },
          { senderId: report.reportedId, recipientId: report.reporterId },
        ],
      },
      orderBy: { sentAt: 'desc' },
      take: 5,
      include: {
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            size: true,
          },
        },
      },
    });

    return {
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      alsoBlockedReporter: report.alsoBlockedReporter,
      createdAt: report.createdAt.toISOString(),
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
      warningNote: report.warningNote,
      reporter: this.reportUserSummary(report.reporter),
      reported: this.reportUserSummary(report.reported),
      reviewedBy: report.reviewedBy,
      messages: newestMessages.reverse().map((message) => ({
        id: message.id,
        senderId: message.senderId,
        recipientId: message.recipientId,
        body: message.body,
        sentAt: message.sentAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        attachments: message.attachments,
      })),
    };
  }

  async actionReport(
    req: Request,
    adminPayload: AdminJwtPayload,
    reportId: string,
    dto: AdminReportActionDto,
  ) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      include: { reported: true },
    });
    if (!report) throw new NotFoundException('Report not found');

    if (dto.action === 'WARN') {
      const warningNote = dto.warningNote?.trim();
      if (!warningNote) {
        throw new BadRequestException('Warning note is required.');
      }
      if (report.reported.role === Role.LOCUM) {
        await this.notifService.notifyLocumAccountWarning({
          recipientId: report.reported.id,
          recipientEmail: report.reported.email,
          warningNote,
          referenceId: report.reported.id,
        });
      } else if (report.reported.role === Role.HOST) {
        await this.notifService.notifyHostAccountWarning({
          recipientId: report.reported.id,
          recipientEmail: report.reported.email,
          warningNote,
          referenceId: report.reported.id,
        });
      }
      await this.prisma.userReport.update({
        where: { id: reportId },
        data: {
          status: UserReportStatus.WARNED,
          warningNote,
          reviewedAt: new Date(),
          reviewedById: adminPayload.sub,
        },
      });
    } else if (dto.action === 'SUSPEND') {
      const suspensionNote = dto.suspensionNote?.trim();
      if (!suspensionNote) {
        throw new BadRequestException('Suspension note is required.');
      }
      await this.updateUser(req, adminPayload, report.reportedId, {
        status: UserStatus.SUSPENDED,
        suspensionNote,
      });
      await this.prisma.userReport.update({
        where: { id: reportId },
        data: {
          status: UserReportStatus.SUSPENDED,
          reviewedAt: new Date(),
          reviewedById: adminPayload.sub,
        },
      });
    } else {
      await this.prisma.userReport.update({
        where: { id: reportId },
        data: {
          status: UserReportStatus.DISMISSED,
          reviewedAt: new Date(),
          reviewedById: adminPayload.sub,
        },
      });
    }

    this.audit.log({
      adminActorId: adminPayload.sub,
      subjectId: report.reportedId,
      action: AuditAction.UPDATE,
      entity: 'UserReport',
      entityId: reportId,
      before: { status: report.status },
      after: { action: dto.action },
      ip: extractIp(req),
      userAgent: req.headers['user-agent'],
      endpoint: `${req.method} ${req.originalUrl}`,
      outcome: 'SUCCESS',
      actorRole: 'admin',
    });

    return this.getReport(reportId);
  }

  async updateUser(
    req: Request,
    adminPayload: AdminJwtPayload,
    userId: string,
    dto: AdminUpdateUserDto,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existing) throw new NotFoundException('User not found');
    if (dto.status === undefined && dto.role === undefined)
      throw new BadRequestException('Nothing to update');

    const beforePick = pickUserAudit(existing);

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.role !== undefined) updateData.role = dto.role;

    // PRD L2-E7.4: save suspension note + timestamp when suspending
    if (dto.status === UserStatus.SUSPENDED) {
      updateData.suspensionNote = dto.suspensionNote ?? null;
      updateData.suspendedAt = new Date();
    }
    // Clear suspension fields on reinstate
    if (
      dto.status === UserStatus.ACTIVE ||
      dto.status === UserStatus.DEACTIVATED
    ) {
      updateData.suspensionNote = null;
      updateData.suspendedAt = null;
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
      const afterPick = pickUserAudit(updated);
      this.audit.log({
        adminActorId: adminPayload.sub,
        subjectId: updated.id,
        action: AuditAction.STATUS_CHANGE,
        entity: 'User',
        entityId: updated.id,
        before: beforePick,
        after: {
          ...afterPick,
          suspensionNote: dto.suspensionNote ?? null,
        },
        ip: extractIp(req),
        userAgent: req.headers['user-agent'],
        endpoint: `${req.method} ${req.originalUrl}`,
        outcome: 'SUCCESS',
        actorRole: 'admin',
      });
      // Notify user of account status change (L-011 locum / H-007 host)
      try {
        if (dto.status === UserStatus.SUSPENDED) {
          if (updated.role === Role.LOCUM) {
            await this.notifService.notifyLocumAccountSuspended({
              recipientId: updated.id,
              recipientEmail: updated.email,
              suspensionNote: dto.suspensionNote,
              referenceId: updated.id,
            });
          } else if (updated.role === Role.HOST) {
            await this.notifService.notifyHostAccountSuspended({
              recipientId: updated.id,
              recipientEmail: updated.email,
              suspensionNote: dto.suspensionNote,
              referenceId: updated.id,
            });
          }
        }
      } catch {}
      return {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        lastLoginAt: updated.lastLoginAt
          ? updated.lastLoginAt.toISOString().slice(0, 10)
          : null,
      };
    } catch (err: unknown) {
      throw new ConflictException(
        String(
          err && typeof err === 'object' && 'message' in err
            ? (err as { message: unknown }).message
            : err,
        ),
      );
    }
  }

  async listVerifications(params: { filter: VerificationListFilter }) {
    const cpsnsWhere =
      params.filter === 'PENDING_TAB'
        ? { cpsnsVerificationStatus: { in: VERIFICATION_PENDING_FILTER } }
        : { cpsnsVerificationStatus: params.filter as VerificationStatus };

    const [locums, hosts] = await Promise.all([
      this.prisma.locumProfile.findMany({
        where: cpsnsWhere,
        orderBy: { updatedAt: 'asc' },
        take: 200,
        include: { user: { select: { email: true } } },
      }),
      this.prisma.hostProfile.findMany({
        where: cpsnsWhere,
        orderBy: { updatedAt: 'asc' },
        take: 200,
        include: { user: { select: { email: true } } },
      }),
    ]);

    const eligibleLocums =
      params.filter === 'PENDING_TAB'
        ? locums.filter((p) => isEligibleForCredentialQueueLocum(p))
        : locums;
    const eligibleHosts =
      params.filter === 'PENDING_TAB'
        ? hosts.filter((p) => isEligibleForCredentialQueueHost(p))
        : hosts;

    const locumRows = eligibleLocums.map((p) => ({
      id: p.id,
      userId: p.userId,
      email: p.user.email,
      name: [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || '—',
      cpsns: formatAdminCpsnsDisplay(p.cpsnsId),
      submittedAt: credentialQueueSubmittedAt(p).toISOString(),
      cpsnsVerificationStatus: p.cpsnsVerificationStatus,
      rejectionReason: p.rejectionReason ?? null,
      rejectedAt: p.rejectedAt ? p.rejectedAt.toISOString() : null,
      userRole: 'LOCUM' as const,
      profileType: 'locum' as const,
    }));

    const hostRows = eligibleHosts.map((p) => ({
      id: p.id,
      userId: p.userId,
      email: p.user.email,
      name:
        [p.contactFirstName, p.contactLastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        p.practiceName ||
        '—',
      cpsns: formatAdminCpsnsDisplay(p.cpsnsNumber),
      submittedAt: credentialQueueSubmittedAt(p).toISOString(),
      cpsnsVerificationStatus: p.cpsnsVerificationStatus,
      rejectionReason: p.rejectionReason ?? null,
      rejectedAt: p.rejectedAt ? p.rejectedAt.toISOString() : null,
      userRole: 'HOST' as const,
      profileType: 'host' as const,
    }));

    return [...locumRows, ...hostRows].sort(
      (a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
  }

  async resolveVerificationProfileType(
    profileId: string,
    hint?: 'locum' | 'host',
  ): Promise<'locum' | 'host' | null> {
    const order: ('locum' | 'host')[] =
      hint === 'host'
        ? ['host', 'locum']
        : hint === 'locum'
          ? ['locum', 'host']
          : ['locum', 'host'];

    for (const kind of order) {
      if (kind === 'host') {
        const row = await this.prisma.hostProfile.findUnique({
          where: { id: profileId },
          select: { id: true },
        });
        if (row) return 'host';
      } else {
        const row = await this.prisma.locumProfile.findUnique({
          where: { id: profileId },
          select: { id: true },
        });
        if (row) return 'locum';
      }
    }
    return null;
  }

  async getVerificationDetail(
    profileId: string,
    profileType: 'locum' | 'host',
  ): Promise<{
    profileType: 'locum' | 'host';
    documents: Array<{
      id: string;
      label: string;
      fileName: string;
      signedUrl: string;
    }>;
    profileFields: Array<{ label: string; value: string }>;
  } | null> {
    const primary =
      profileType === 'host'
        ? await this.buildHostVerificationDetail(profileId)
        : await this.buildLocumVerificationDetail(profileId);
    if (primary) return primary;

    return profileType === 'host'
      ? await this.buildLocumVerificationDetail(profileId)
      : await this.buildHostVerificationDetail(profileId);
  }

  /** Profile + signed documents for admin user management (lookup by User.id). */
  async getUserProfileByUserId(userId: string): Promise<{
    profileType: 'locum' | 'host';
    documents: Array<{
      id: string;
      label: string;
      fileName: string;
      signedUrl: string;
    }>;
    profileFields: Array<{ label: string; value: string }>;
    userId: string;
    email: string;
    role: 'LOCUM' | 'HOST';
    hasProfile: boolean;
  } | null> {
    const user = await this.prisma.user.findUnique({
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
    if (!user || user.role === Role.ADMIN) return null;

    if (user.role === Role.HOST && user.hostProfile) {
      const detail = await this.buildHostVerificationDetail(user.hostProfile.id);
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

    if (user.role === Role.LOCUM && user.locumProfile) {
      const detail = await this.buildLocumVerificationDetail(user.locumProfile.id);
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

    const profileType = user.role === Role.HOST ? ('host' as const) : ('locum' as const);
    const profileFields = [
      this.profileField('Email', user.email),
      this.profileField('Account status', user.status),
      this.profileField(
        'Role',
        user.role === Role.HOST ? 'Host Physician' : 'Locum Physician',
      ),
    ].filter((f): f is { label: string; value: string } => f !== null);

    return {
      profileType,
      documents: [],
      profileFields,
      userId: user.id,
      email: user.email,
      role: user.role === Role.HOST ? 'HOST' : 'LOCUM',
      hasProfile: false,
    };
  }

  private async buildHostVerificationDetail(profileId: string) {
    const profile = await this.prisma.hostProfile.findUnique({
      where: { id: profileId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) return null;

    const docCandidates = await Promise.all([
      this.verificationDocument(
        'license',
        'CPSNS License',
        profile.licenseFile,
        profile.licenseOriginalName,
      ),
      this.verificationDocument(
        'photo-id',
        'Photo ID',
        profile.photoIdFile,
        profile.photoIdOriginalName,
      ),
    ]);
    const documents = docCandidates.filter(
      (d): d is NonNullable<typeof d> => d !== null,
    );

    const profileFields = [
      this.profileField('Email', profile.user.email),
      this.profileField('Clinic / practice', profile.practiceName),
      this.profileField(
        'Contact',
        [profile.contactFirstName, profile.contactLastName]
          .filter(Boolean)
          .join(' '),
      ),
      this.cpsnsProfileField(profile.cpsnsNumber),
      this.profileField('Speciality', profile.speciality),
      this.profileField('Address', profile.address1 ?? profile.address),
      this.profileField('Address line 2', profile.address2),
      this.profileField('City', profile.city),
      this.profileField('Province', profile.province),
      this.profileField('Postal code', profile.postalCode),
      this.profileField('Practice type', profile.practiceType),
      this.profileField('Physicians on site', profile.numPhysicians),
      this.profileField('EMR', profile.emr),
      this.profileField('Patient volume', profile.patientVol),
      this.profileField('Services', profile.servicesOffered?.join(', ')),
      this.profileField(
        'Accommodation provided',
        profile.accommodationProvided ? 'Yes' : 'No',
      ),
      this.profileField('Clinic description', profile.highlights),
      this.profileField('Verification status', profile.cpsnsVerificationStatus),
    ].filter((f): f is { label: string; value: string } => f !== null);

    return {
      profileType: 'host' as const,
      documents,
      profileFields,
    };
  }

  private async buildLocumVerificationDetail(profileId: string) {
    const profile = await this.prisma.locumProfile.findUnique({
      where: { id: profileId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) return null;

    const docCandidates = await Promise.all([
      this.verificationDocument(
        'license',
        'CPSNS License',
        profile.licenseFileName,
        profile.licenseOriginalName,
      ),
      this.verificationDocument(
        'resume',
        'CV / Resume',
        profile.resumeFileName,
        profile.resumeOriginalName,
      ),
      this.verificationDocument(
        'extra',
        'Additional documents',
        profile.extraFileName,
        profile.extraOriginalName,
      ),
    ]);
    const documents = docCandidates.filter(
      (d): d is NonNullable<typeof d> => d !== null,
    );

    const profileFields = [
      this.profileField('Email', profile.user.email),
      this.profileField('First name', profile.firstName),
      this.profileField('Last name', profile.lastName),
      this.cpsnsProfileField(profile.cpsnsId),
      this.profileField(
        'Specialty',
        profile.specializationText ?? profile.specialty,
      ),
      this.profileField('Years of experience', profile.yearsOfExperience),
      this.profileField(
        'Address',
        [profile.address1, profile.address2].filter(Boolean).join(', '),
      ),
      this.profileField('City', profile.city),
      this.profileField('Province', profile.province),
      this.profileField('Postal code', profile.postalCode),
      this.profileField('Professional summary', profile.summary),
      this.profileField('Verification status', profile.cpsnsVerificationStatus),
    ].filter((f): f is { label: string; value: string } => f !== null);

    return {
      profileType: 'locum' as const,
      documents,
      profileFields,
    };
  }

  async updateLocumVerification(
    req: Request,
    adminPayload: AdminJwtPayload,
    locumProfileId: string,
    dto: AdminUpdateVerificationDto,
  ) {
    const { cpsnsVerificationStatus: nextStatus, rejectionReason } = dto;

    // PRD AD-02: rejection reason is mandatory when rejecting
    if (
      nextStatus === VerificationStatus.REJECTED &&
      !rejectionReason?.trim()
    ) {
      throw new BadRequestException(
        'Rejection reason is required when rejecting a credential submission.',
      );
    }

    const profile = await this.prisma.locumProfile.findUnique({
      where: { id: locumProfileId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) throw new NotFoundException('Locum profile not found');

    const before = {
      cpsnsVerificationStatus: profile.cpsnsVerificationStatus,
      cpsnsVerifiedAt: profile.cpsnsVerifiedAt?.toISOString() ?? null,
    };

    const updated = await this.prisma.locumProfile.update({
      where: { id: locumProfileId },
      data: {
        cpsnsVerificationStatus: nextStatus,
        cpsnsVerifiedAt:
          nextStatus === VerificationStatus.VERIFIED ? new Date() : null,
        // PRD L2-E7.3: save rejection reason + timestamp
        rejectionReason:
          nextStatus === VerificationStatus.REJECTED
            ? (rejectionReason ?? null)
            : null,
        rejectedAt:
          nextStatus === VerificationStatus.REJECTED ? new Date() : null,
      },
    });

    const after = {
      cpsnsVerificationStatus: updated.cpsnsVerificationStatus,
      cpsnsVerifiedAt: updated.cpsnsVerifiedAt?.toISOString() ?? null,
      rejectionReason: updated.rejectionReason ?? null,
    };

    this.audit.log({
      adminActorId: adminPayload.sub,
      subjectId: profile.userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'LocumProfile',
      entityId: profile.id,
      before,
      after,
      ip: extractIp(req),
      userAgent: req.headers['user-agent'],
      endpoint: `${req.method} ${req.originalUrl}`,
      outcome: 'SUCCESS',
      actorRole: 'admin',
    });

    const name =
      [updated.firstName, updated.lastName].filter(Boolean).join(' ').trim() ||
      '—';

    // L-009 / L-010: notify locum of verification result
    try {
      if (nextStatus === 'VERIFIED') {
        await this.notifService.notifyLocumAccountVerified({
          recipientId: profile.userId,
          recipientEmail: profile.user.email,
          firstName: updated.firstName,
          lastName: updated.lastName,
          referenceId: profile.id,
        });
      } else if (nextStatus === 'REJECTED') {
        await this.notifService.notifyLocumVerificationRejected({
          recipientId: profile.userId,
          recipientEmail: profile.user.email,
          firstName: updated.firstName,
          lastName: updated.lastName,
          rejectionReason,
          referenceId: profile.id,
        });
      }
    } catch {}

    return {
      id: updated.id,
      userId: updated.userId,
      email: profile.user.email,
      name,
      cpsns: formatAdminCpsnsDisplay(updated.cpsnsId),
      submittedAt: updated.updatedAt.toISOString(),
      cpsnsVerificationStatus: updated.cpsnsVerificationStatus,
      rejectionReason: updated.rejectionReason ?? null,
    };
  }

  async updateHostVerification(
    req: Request,
    adminPayload: AdminJwtPayload,
    hostProfileId: string,
    dto: AdminUpdateVerificationDto,
  ) {
    const { cpsnsVerificationStatus: nextStatus, rejectionReason } = dto;

    if (
      nextStatus === VerificationStatus.REJECTED &&
      !rejectionReason?.trim()
    ) {
      throw new BadRequestException(
        'Rejection reason is required when rejecting a credential submission.',
      );
    }

    const profile = await this.prisma.hostProfile.findUnique({
      where: { id: hostProfileId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) throw new NotFoundException('Host profile not found');

    const before = {
      cpsnsVerificationStatus: profile.cpsnsVerificationStatus,
      cpsnsVerifiedAt: profile.cpsnsVerifiedAt?.toISOString() ?? null,
    };

    const updated = await this.prisma.hostProfile.update({
      where: { id: hostProfileId },
      data: {
        cpsnsVerificationStatus: nextStatus,
        cpsnsVerifiedAt:
          nextStatus === VerificationStatus.VERIFIED ? new Date() : null,
        rejectionReason:
          nextStatus === VerificationStatus.REJECTED
            ? (rejectionReason ?? null)
            : null,
        rejectedAt:
          nextStatus === VerificationStatus.REJECTED ? new Date() : null,
      },
    });

    this.audit.log({
      adminActorId: adminPayload.sub,
      subjectId: profile.userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'HostProfile',
      entityId: hostProfileId,
      before,
      after: {
        cpsnsVerificationStatus: updated.cpsnsVerificationStatus,
        cpsnsVerifiedAt: updated.cpsnsVerifiedAt?.toISOString() ?? null,
        rejectionReason: updated.rejectionReason ?? null,
      },
      ip: extractIp(req),
      userAgent: req.headers['user-agent'],
      endpoint: `${req.method} ${req.originalUrl}`,
      outcome: 'SUCCESS',
      actorRole: 'admin',
    });

    // H-005 / H-006: notify host of verification result
    try {
      if (nextStatus === 'VERIFIED') {
        await this.notifService.notifyHostAccountVerified({
          recipientId: profile.userId,
          recipientEmail: profile.user.email,
          contactFirstName: updated.contactFirstName,
          contactLastName: updated.contactLastName,
          referenceId: profile.id,
        });
      } else if (nextStatus === 'REJECTED') {
        await this.notifService.notifyHostVerificationRejected({
          recipientId: profile.userId,
          recipientEmail: profile.user.email,
          contactFirstName: updated.contactFirstName,
          contactLastName: updated.contactLastName,
          rejectionReason,
          referenceId: profile.id,
        });
      }
    } catch {}

    return {
      id: updated.id,
      userId: updated.userId,
      email: profile.user.email,
      name:
        [profile.contactFirstName, profile.contactLastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        profile.practiceName ||
        '—',
      cpsns: formatAdminCpsnsDisplay(updated.cpsnsNumber),
      submittedAt: updated.updatedAt.toISOString(),
      cpsnsVerificationStatus: updated.cpsnsVerificationStatus,
      rejectionReason: updated.rejectionReason ?? null,
      userRole: 'HOST' as const,
    };
  }

  async listAuditLogs(params: { q?: string; take: number }) {
    const q = params.q?.trim();
    const rows = await this.prisma.auditLog.findMany({
      where: q
        ? {
            OR: [
              { entity: { contains: q, mode: 'insensitive' } },
              { entityId: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: params.take,
      include: {
        actor: { select: { email: true } },
        adminActor: { select: { email: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      actor: r.adminActor?.email ?? r.actor?.email ?? '—',
      actorRole: r.actorRole ?? '—',
      action: r.action,
      entity: r.entity,
      outcome: r.outcome,
      createdAt: r.createdAt.toISOString(),
      detail: formatAuditDetail({ before: r.before, after: r.after }),
    }));
  }
}

function pickUserAudit(u: { status: UserStatus; role: Role }) {
  return { status: u.status, role: u.role };
}

function extractIp(req: Request): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0]?.trim();
  return req.ip;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
