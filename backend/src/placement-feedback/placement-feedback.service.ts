import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PlacementFeedbackBasedOn,
  PlacementFeedbackBookAgain,
  PlacementFeedbackRating,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmailService } from '../notifications/email.service.js';
import { allowsEmailForEvent } from '../notifications/email-prefs.js';
import {
  formatJobDate,
  formatLocumDoctorName,
} from '../notifications/notification-copy.js';
import { buildPlacementFeedbackRequestEmail } from './placement-feedback-copy.js';
import { PLACEMENT_FEEDBACK_REMINDER_DAYS } from './placement-feedback.constants.js';
import type { SubmitPlacementFeedbackDto } from './placement-feedback.dto.js';

function newAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

function appOrigin(config: ConfigService): string {
  return (
    config.get<string>('HOST_FRONTEND_URL')?.trim() ||
    config.get<string>('ALLOWED_ORIGINS')?.split(',')[0]?.trim() ||
    process.env.HOST_FRONTEND_URL?.trim() ||
    process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim() ||
    'https://locumlink.ca'
  ).replace(/\/$/, '');
}

function coverageLabel(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
): string {
  const start = formatJobDate(startDate);
  const end = formatJobDate(endDate);
  if (start && end && start !== end) return `${start} - ${end}`;
  return start || end || 'Your coverage dates';
}

function needsReviewFromAnswers(answers: {
  professionalism: PlacementFeedbackRating;
  communication: PlacementFeedbackRating;
  reliability: PlacementFeedbackRating;
  documentation: PlacementFeedbackRating;
  bookAgain: PlacementFeedbackBookAgain;
}): boolean {
  const ratings = [
    answers.professionalism,
    answers.communication,
    answers.reliability,
    answers.documentation,
  ];
  return (
    ratings.some((r) => r === 'SIGNIFICANT') || answers.bookAgain === 'NO'
  );
}

@Injectable()
export class PlacementFeedbackService {
  private readonly logger = new Logger(PlacementFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * For each accepted application on newly COMPLETED postings, create a PENDING
   * feedback request (if missing) and notify the host once.
   */
  async requestFeedbackForCompletedPostings(
    jobPostingIds: string[],
  ): Promise<void> {
    const ids = [...new Set(jobPostingIds.filter(Boolean))];
    if (ids.length === 0) return;

    const apps = await this.prisma.application.findMany({
      where: {
        jobPostingId: { in: ids },
        jobPosting: { status: 'COMPLETED', isDeleted: false },
        OR: [
          { locumResponse: 'ACCEPTED' },
          { locumAcceptedAt: { not: null } },
        ],
      },
      select: {
        id: true,
        jobPostingId: true,
        locumProfileId: true,
        jobPosting: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            hostProfile: {
              select: {
                userId: true,
                practiceName: true,
                user: { select: { id: true, email: true, emailPrefs: true } },
              },
            },
          },
        },
        locumProfile: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    for (const app of apps) {
      const hostUserId = app.jobPosting.hostProfile?.userId;
      if (!hostUserId) continue;

      const existing = await this.prisma.placementFeedback.findUnique({
        where: { applicationId: app.id },
        select: { id: true },
      });
      if (existing) continue;

      try {
        const accessToken = newAccessToken();
        const row = await this.prisma.placementFeedback.create({
          data: {
            applicationId: app.id,
            jobPostingId: app.jobPostingId,
            hostUserId,
            locumProfileId: app.locumProfileId,
            accessToken,
            status: 'PENDING',
          },
        });
        await this.notifyHostRequest({
          feedbackId: row.id,
          applicationId: app.id,
          accessToken,
          hostUserId,
          hostEmail: app.jobPosting.hostProfile?.user?.email,
          emailPrefs: app.jobPosting.hostProfile?.user?.emailPrefs,
          locumName: formatLocumDoctorName(
            app.locumProfile.firstName,
            app.locumProfile.lastName,
          ),
          clinicName:
            app.jobPosting.hostProfile?.practiceName?.trim() || 'Your clinic',
          coverageLabel: coverageLabel(
            app.jobPosting.startDate,
            app.jobPosting.endDate,
          ),
          reminder: false,
        });
      } catch (err) {
        // Unique race: another worker created the row - skip notify.
        this.logger.warn(
          `Placement feedback create skipped for application ${app.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /** Daily: one reminder for PENDING requests older than N days. */
  async sendPendingReminders(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PLACEMENT_FEEDBACK_REMINDER_DAYS);

    const pending = await this.prisma.placementFeedback.findMany({
      where: {
        status: 'PENDING',
        reminderSentAt: null,
        requestedAt: { lte: cutoff },
      },
      select: {
        id: true,
        applicationId: true,
        accessToken: true,
        hostUserId: true,
        jobPosting: {
          select: {
            startDate: true,
            endDate: true,
            hostProfile: {
              select: {
                practiceName: true,
                user: { select: { email: true, emailPrefs: true } },
              },
            },
          },
        },
        locumProfile: {
          select: { firstName: true, lastName: true },
        },
      },
      take: 200,
    });

    let sent = 0;
    for (const row of pending) {
      try {
        await this.notifyHostRequest({
          feedbackId: row.id,
          applicationId: row.applicationId,
          accessToken: row.accessToken,
          hostUserId: row.hostUserId,
          hostEmail: row.jobPosting.hostProfile?.user?.email,
          emailPrefs: row.jobPosting.hostProfile?.user?.emailPrefs,
          locumName: formatLocumDoctorName(
            row.locumProfile.firstName,
            row.locumProfile.lastName,
          ),
          clinicName:
            row.jobPosting.hostProfile?.practiceName?.trim() || 'Your clinic',
          coverageLabel: coverageLabel(
            row.jobPosting.startDate,
            row.jobPosting.endDate,
          ),
          reminder: true,
        });
        await this.prisma.placementFeedback.update({
          where: { id: row.id },
          data: { reminderSentAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        this.logger.error(
          `Placement feedback reminder failed for ${row.id}`,
          err,
        );
      }
    }
    return sent;
  }

  async getForHost(hostUserId: string, applicationId: string) {
    const row = await this.loadAuthorizedRow(hostUserId, applicationId);
    return this.toPayload(row);
  }

  /** Email-link access: no login required when token matches. */
  async getByAccessToken(applicationId: string, accessToken: string) {
    const row = await this.loadByAccessToken(applicationId, accessToken);
    return this.toPayload(row);
  }

  async submitForHost(
    hostUserId: string,
    applicationId: string,
    dto: SubmitPlacementFeedbackDto,
  ) {
    const row = await this.loadAuthorizedRow(hostUserId, applicationId);
    return this.submitAnswers(row.id, row.status, dto);
  }

  async submitByAccessToken(
    applicationId: string,
    accessToken: string,
    dto: SubmitPlacementFeedbackDto,
  ) {
    const row = await this.loadByAccessToken(applicationId, accessToken);
    return this.submitAnswers(row.id, row.status, dto);
  }

  private async submitAnswers(
    rowId: string,
    status: 'PENDING' | 'SUBMITTED',
    dto: SubmitPlacementFeedbackDto,
  ) {
    if (status === 'SUBMITTED') {
      const existing = await this.prisma.placementFeedback.findUniqueOrThrow({
        where: { id: rowId },
        include: this.payloadInclude,
      });
      return this.toPayload(existing);
    }

    const answers = {
      professionalism: dto.professionalism as PlacementFeedbackRating,
      communication: dto.communication as PlacementFeedbackRating,
      reliability: dto.reliability as PlacementFeedbackRating,
      documentation: dto.documentation as PlacementFeedbackRating,
      bookAgain: dto.bookAgain as PlacementFeedbackBookAgain,
      basedOn: dto.basedOn as PlacementFeedbackBasedOn,
    };

    const updated = await this.prisma.placementFeedback.update({
      where: { id: rowId },
      data: {
        ...answers,
        comments: dto.comments?.trim() || null,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        needsReview: needsReviewFromAnswers(answers),
      },
      include: this.payloadInclude,
    });

    return this.toPayload(updated);
  }

  private readonly payloadInclude = {
    locumProfile: { select: { firstName: true, lastName: true } },
    jobPosting: {
      select: {
        title: true,
        startDate: true,
        endDate: true,
        hostProfile: { select: { practiceName: true } },
      },
    },
  } as const;

  private async loadByAccessToken(applicationId: string, accessToken: string) {
    const token = accessToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Feedback link is missing its access token.');
    }
    const row = await this.prisma.placementFeedback.findUnique({
      where: { applicationId },
      include: this.payloadInclude,
    });
    if (!row || row.accessToken !== token) {
      throw new UnauthorizedException(
        'This feedback link is invalid or has expired.',
      );
    }
    return row;
  }

  private async loadAuthorizedRow(hostUserId: string, applicationId: string) {
    const row = await this.prisma.placementFeedback.findUnique({
      where: { applicationId },
      include: this.payloadInclude,
    });
    if (!row) {
      // Allow opening form only when a request exists (created on COMPLETED).
      const app = await this.prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          jobPosting: {
            select: {
              status: true,
              hostProfile: { select: { userId: true } },
            },
          },
        },
      });
      if (!app) throw new NotFoundException('Feedback request not found.');
      if (app.jobPosting.hostProfile?.userId !== hostUserId) {
        throw new ForbiddenException('You cannot view this feedback form.');
      }
      if (app.jobPosting.status !== 'COMPLETED') {
        throw new BadRequestException(
          'Feedback is available after the placement ends.',
        );
      }
      throw new NotFoundException(
        'Feedback has not been requested for this placement yet.',
      );
    }
    if (row.hostUserId !== hostUserId) {
      throw new ForbiddenException('You cannot view this feedback form.');
    }
    return row;
  }

  private toPayload(
    row: Awaited<ReturnType<PlacementFeedbackService['loadAuthorizedRow']>>,
  ) {
    const locumName = formatLocumDoctorName(
      row.locumProfile.firstName,
      row.locumProfile.lastName,
    );
    const clinicName =
      row.jobPosting.hostProfile?.practiceName?.trim() || 'Your clinic';
    return {
      applicationId: row.applicationId,
      status: row.status,
      submittedAt: row.submittedAt,
      locumName,
      clinicName,
      jobTitle: row.jobPosting.title,
      coverageLabel: coverageLabel(
        row.jobPosting.startDate,
        row.jobPosting.endDate,
      ),
      answers:
        row.status === 'SUBMITTED'
          ? {
              professionalism: row.professionalism,
              communication: row.communication,
              reliability: row.reliability,
              documentation: row.documentation,
              bookAgain: row.bookAgain,
              basedOn: row.basedOn,
              comments: row.comments,
            }
          : null,
    };
  }

  private async notifyHostRequest(params: {
    feedbackId: string;
    applicationId: string;
    accessToken: string;
    hostUserId: string;
    hostEmail?: string | null;
    emailPrefs?: unknown;
    locumName: string;
    clinicName: string;
    coverageLabel: string;
    reminder: boolean;
  }): Promise<void> {
    const formPath = `/host/feedback/${encodeURIComponent(params.applicationId)}?t=${encodeURIComponent(params.accessToken)}`;
    const formUrl = `${appOrigin(this.config)}${formPath}`;
    const eventType = params.reminder
      ? 'H_021_PLACEMENT_FEEDBACK_REMINDER'
      : 'H_020_PLACEMENT_FEEDBACK_REQUEST';
    const title = params.reminder
      ? 'Reminder: locum feedback'
      : 'How was your locum experience?';
    const body = params.reminder
      ? `Please share brief confidential feedback about ${params.locumName} (${params.coverageLabel}).`
      : `Take about 2 minutes to share confidential feedback about ${params.locumName} (${params.coverageLabel}).`;

    await this.notif.create({
      recipientId: params.hostUserId,
      eventType,
      title,
      body,
      href: formPath,
      priority: params.reminder ? 'NORMAL' : 'MEDIUM',
      actionLabel: 'Complete feedback',
      referenceId: params.applicationId,
      referenceType: 'Application',
    });

    if (!params.hostEmail) return;
    if (!allowsEmailForEvent(params.emailPrefs, eventType)) {
      this.logger.log(
        `Skipping placement feedback email for ${params.hostEmail} (${eventType}): opted out`,
      );
      return;
    }

    const copy = buildPlacementFeedbackRequestEmail({
      locumName: params.locumName,
      clinicName: params.clinicName,
      coverageLabel: params.coverageLabel,
      formUrl,
      reminder: params.reminder,
    });
    const result = await this.email.send({
      to: params.hostEmail,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    });
    if (!result.ok) {
      this.logger.error(
        `Placement feedback email failed for ${params.hostEmail}: ${result.error}`,
      );
    }
  }
}
