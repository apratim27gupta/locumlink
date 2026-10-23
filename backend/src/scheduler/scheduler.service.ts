import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmailDigestService } from '../notifications/email-digest.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { browseShiftStartActiveSql, postingStatusAfterLocumAccept } from '../host/job-schedule.util.js';
import { startCron } from '../telemetry/app-metrics.js';

const locumReminderInclude = {
  locumProfile: {
    select: {
      firstName: true,
      lastName: true,
      user: { select: { id: true, email: true } },
    },
  },
  jobPosting: {
    select: {
      id: true,
      title: true,
      startDate: true,
      startTime: true,
      hostProfile: { select: { practiceName: true } },
    },
  },
} as const;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifService: NotificationsService,
    private readonly emailDigest: EmailDigestService,
    private readonly paymentsService: PaymentsService,
  ) {}

  private async shiftReminderAlreadySent(
    eventType: string,
    applicationId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.notificationEvent.findFirst({
      where: {
        eventType,
        referenceId: applicationId,
        referenceType: 'Application',
      },
      select: { id: true },
    });
    return existing != null;
  }

  // L-005 / L-007: shift reminders
  @Cron(CronExpression.EVERY_HOUR)
  async handleShiftReminders() {
    const cron = startCron('shift_reminders');
    try {
      const now = new Date();
      const confirmedApps = await this.prisma.application.findMany({
        where: {
          status: 'CONFIRMED',
          jobPosting: {
            isDeleted: false,
            status: { notIn: ['EXPIRED', 'COMPLETED'] },
            startDate: { not: null },
          },
        },
        include: locumReminderInclude,
      });

      for (const app of confirmedApps) {
        if (!app.jobPosting.startDate) continue;
        const locum = app.locumProfile;
        const user = locum.user;
        if (!user?.email) continue;

        const diffH =
          (new Date(app.jobPosting.startDate).getTime() - now.getTime()) /
          3600000;
        const clinicName =
          app.jobPosting.hostProfile?.practiceName ?? 'the clinic';
        const base = {
          recipientId: user.id,
          recipientEmail: user.email,
          firstName: locum.firstName,
          lastName: locum.lastName,
          clinicName,
          applicationId: app.id,
        };

        if (diffH >= 47 && diffH < 48) {
          if (
            !(await this.shiftReminderAlreadySent(
              'L_005_SHIFT_REMINDER_48H',
              app.id,
            ))
          ) {
            await this.notifService.notifyLocumShiftReminder48h({
              ...base,
              startDate: app.jobPosting.startDate,
              startTime: app.jobPosting.startTime,
            });
          }
        }

        if (diffH >= 1 && diffH < 2) {
          if (
            !(await this.shiftReminderAlreadySent(
              'L_007_SHIFT_REMINDER_2H',
              app.id,
            ))
          ) {
            await this.notifService.notifyLocumShiftReminder2h({
              ...base,
              startTime: app.jobPosting.startTime,
            });
          }
        }
      }
    } catch (err) {
      cron.failed();
      this.logger.error('Shift reminder cron failed', err);
    } finally {
      cron.end();
    }
  }

  // L-006: evening before shift (8 PM)
  @Cron('0 20 * * *')
  async handleEveningReminders() {
    const cron = startCron('evening_reminders');
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const confirmedApps = await this.prisma.application.findMany({
        where: {
          status: 'CONFIRMED',
          jobPosting: {
            startDate: { not: null },
            isDeleted: false,
            status: { notIn: ['EXPIRED', 'COMPLETED'] },
          },
        },
        include: locumReminderInclude,
      });

      for (const app of confirmedApps) {
        if (!app.jobPosting.startDate) continue;
        if (
          new Date(app.jobPosting.startDate).toISOString().slice(0, 10) !==
          tomorrowStr
        ) {
          continue;
        }
        const user = app.locumProfile.user;
        if (!user?.email) continue;

        if (
          await this.shiftReminderAlreadySent(
            'L_006_SHIFT_REMINDER_EVENING',
            app.id,
          )
        ) {
          continue;
        }

        await this.notifService.notifyLocumShiftReminderEvening({
          recipientId: user.id,
          recipientEmail: user.email,
          firstName: app.locumProfile.firstName,
          lastName: app.locumProfile.lastName,
          clinicName: app.jobPosting.hostProfile?.practiceName ?? 'the clinic',
          startTime: app.jobPosting.startTime,
          applicationId: app.id,
        });
      }
    } catch (err) {
      cron.failed();
      this.logger.error('Evening reminder cron failed', err);
    } finally {
      cron.end();
    }
  }

  // H-008: Posting expiring in 48h (host)
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiryReminders() {
    const cron = startCron('expiry_reminders');
    try {
      const now = new Date();
      const in47h = new Date(now.getTime() + 47 * 3600000);
      const in48h = new Date(now.getTime() + 48 * 3600000);

      const jobs = await this.prisma.jobPosting.findMany({
        where: {
          status: 'ACTIVE',
          isDeleted: false,
          expiresAt: { gte: in47h, lte: in48h },
        },
        include: {
          hostProfile: {
            select: {
              userId: true,
              contactFirstName: true,
              contactLastName: true,
              user: { select: { email: true } },
            },
          },
        },
      });

      for (const job of jobs) {
        const host = job.hostProfile;
        const email = host.user?.email;
        if (!email) continue;
        await this.notifService.notifyHostPostingExpiring({
          recipientId: host.userId,
          recipientEmail: email,
          jobId: job.id,
          jobTitle: job.title,
          startDate: job.startDate,
        });
      }
    } catch (err) {
      cron.failed();
      this.logger.error('Expiry reminder cron failed', err);
    } finally {
      cron.end();
    }
  }

  /** Flush legacy queued digests (message emails are instant; flush clears backlog). */
  @Cron(CronExpression.EVERY_HOUR)
  async handleEmailDigests() {
    const cron = startCron('email_digest');
    try {
      await this.emailDigest.flushDueDigests();
    } catch (err) {
      cron.failed();
      this.logger.error('Email digest cron failed', err);
    } finally {
      cron.end();
    }
  }

  /** Catch payments whose Stripe webhook never arrived, and close expired Checkout sessions. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileStripeCheckouts() {
    const cron = startCron('stripe_reconcile');
    try {
      try {
        await this.paymentsService.reconcileOpenCheckoutSessions();
      } catch (err) {
        cron.failed();
        this.logger.error('Stripe reconciliation cron failed', err);
      }
      try {
        await this.paymentsService.reconcileRefunds();
      } catch (err) {
        cron.failed();
        this.logger.error('Stripe refund reconciliation cron failed', err);
      }
    } finally {
      cron.end();
    }
  }

  /** Mark ACTIVE postings whose shift start (date + time) has passed as EXPIRED. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expirePostingsWithPassedStartDate() {
    const cron = startCron('expire_postings');
    try {
      const shiftActive = browseShiftStartActiveSql();
      const result = await this.prisma.$executeRaw`
        UPDATE job_postings
        SET status = 'EXPIRED'::"PostingStatus"
        WHERE status = 'ACTIVE'::"PostingStatus"
          AND is_deleted = false
          AND start_date IS NOT NULL
          AND NOT (${shiftActive})
          AND NOT EXISTS (
            SELECT 1 FROM applications a
            WHERE a."jobPostingId" = job_postings.id
              AND (
                a."locumResponse" = 'ACCEPTED'::"LocumResponse"
                OR a."locumAcceptedAt" IS NOT NULL
              )
          )
      `;
      if (result > 0) {
        this.logger.log(
          `Expired ${result} posting(s) with passed shift start`,
        );
      }
    } catch (err) {
      cron.failed();
      this.logger.error('Expire passed shift start cron failed', err);
    } finally {
      cron.end();
    }
  }

  /** Promote filled jobs: ACTIVE→ONGOING in window, ONGOING/ACTIVE→COMPLETED after end. */
  @Cron(CronExpression.EVERY_HOUR)
  async syncFilledJobPostingStatuses() {
    const cron = startCron('sync_filled_postings');
    try {
      const jobs = await this.prisma.jobPosting.findMany({
        where: {
          isDeleted: false,
          status: { in: ['ACTIVE', 'SCHEDULED', 'ONGOING'] },
          applications: {
            some: {
              OR: [
                { locumResponse: 'ACCEPTED' },
                { locumAcceptedAt: { not: null } },
              ],
            },
          },
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      });

      const toComplete: string[] = [];
      const toOngoing: string[] = [];
      const toScheduled: string[] = [];
      for (const j of jobs) {
        const next = postingStatusAfterLocumAccept(j.startDate, j.endDate);
        if (next === 'COMPLETED' && j.status !== 'COMPLETED') {
          toComplete.push(j.id);
        } else if (next === 'ONGOING' && j.status !== 'ONGOING') {
          toOngoing.push(j.id);
        } else if (next === 'SCHEDULED' && j.status !== 'SCHEDULED') {
          toScheduled.push(j.id);
        }
      }

      if (toComplete.length > 0) {
        await this.prisma.jobPosting.updateMany({
          where: { id: { in: toComplete } },
          data: { status: 'COMPLETED' },
        });
        try {
          const topUps = await this.paymentsService.reconcileTierTopUpsAfterCompletion(
            toComplete,
          );
          if (topUps.topUpsCreated + topUps.primariesUpdated > 0) {
            this.logger.log(
              `Match fee tier top-ups after completion: ${topUps.topUpsCreated} new, ${topUps.primariesUpdated} updated`,
            );
          }
        } catch (err) {
          cron.failed();
          this.logger.error('Match fee tier top-up reconcile after completion failed', err);
        }
      }
      if (toOngoing.length > 0) {
        await this.prisma.jobPosting.updateMany({
          where: { id: { in: toOngoing } },
          data: { status: 'ONGOING' },
        });
      }
      if (toScheduled.length > 0) {
        await this.prisma.jobPosting.updateMany({
          where: { id: { in: toScheduled } },
          data: { status: 'SCHEDULED' },
        });
      }
      if (toComplete.length + toOngoing.length + toScheduled.length > 0) {
        this.logger.log(
          `Synced filled postings: ${toScheduled.length} scheduled, ${toOngoing.length} ongoing, ${toComplete.length} completed`,
        );
      }
    } catch (err) {
      cron.failed();
      this.logger.error('Sync filled job posting statuses cron failed', err);
    } finally {
      cron.end();
    }
  }

  /** Mark pending match-fee invoices overdue, send recurring reminders, escalate long-overdue accounts. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleMatchFeeInvoiceLifecycle(): Promise<void> {
    const cron = startCron('match_fee_lifecycle');
    try {
      await this.paymentsService.reconcileTierTopUpsAfterCompletion();
      await this.paymentsService.markOverdueInvoices();
      await this.paymentsService.sendRecurringOverdueReminders();
      await this.paymentsService.escalateLongOverdueInvoices();
    } catch (err) {
      cron.failed();
      this.logger.error('Match fee invoice lifecycle cron failed', err);
    } finally {
      cron.end();
    }
  }
}
