import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

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
    try {
      const now = new Date();
      const confirmedApps = await this.prisma.application.findMany({
        where: {
          status: 'CONFIRMED',
          jobPosting: { startDate: { not: null } },
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
      this.logger.error('Shift reminder cron failed', err);
    }
  }

  // L-006: evening before shift (8 PM)
  @Cron('0 20 * * *')
  async handleEveningReminders() {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const confirmedApps = await this.prisma.application.findMany({
        where: {
          status: 'CONFIRMED',
          jobPosting: { startDate: { not: null } },
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
      this.logger.error('Evening reminder cron failed', err);
    }
  }

  // H-008: Posting expiring in 48h (host)
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiryReminders() {
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
      this.logger.error('Expiry reminder cron failed', err);
    }
  }
}
