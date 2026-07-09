import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from './email.service.js';
import {
  buildA001HostRegistration,
  buildA002LocumRegistration,
  buildA003CredentialUploaded,
  buildA004AccountFlagged,
  buildA005CpsnsUpdated,
} from './admin-notification-copy.js';

export type AdminNotifEventType =
  | 'A_001_NEW_HOST_REGISTRATION'
  | 'A_002_NEW_LOCUM_REGISTRATION'
  | 'A_003_CREDENTIAL_UPLOADED'
  | 'A_004_ACCOUNT_FLAGGED'
  | 'A_005_CPSNS_UPDATED';

export type AdminNotificationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'NORMAL';

export type AdminNotificationItem = {
  id: string;
  type: 'registration' | 'credential' | 'flagged';
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
  priority?: AdminNotificationPriority;
  actionLabel?: string;
  eventType?: string;
};

function eventTypeToCategory(eventType: string): AdminNotificationItem['type'] {
  if (eventType.includes('CREDENTIAL') || eventType.includes('CPSNS'))
    return 'credential';
  if (eventType.includes('FLAGGED')) return 'flagged';
  return 'registration';
}

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private async notifyAllAdmins(params: {
    eventType: AdminNotifEventType;
    title: string;
    body: string;
    href: string;
    priority?: AdminNotificationPriority;
    actionLabel?: string;
    referenceId?: string;
    referenceType?: string;
    emailSubject?: string;
    emailBody?: string;
  }): Promise<void> {
    const admins = await this.prisma.admin.findMany({
      select: { id: true, email: true },
    });
    await Promise.allSettled(
      admins.map((admin) =>
        this.createForAdmin({
          adminId: admin.id,
          adminEmail: admin.email,
          ...params,
        }),
      ),
    );
  }

  private async createForAdmin(params: {
    adminId: string;
    adminEmail: string;
    eventType: AdminNotifEventType;
    title: string;
    body: string;
    href: string;
    priority?: AdminNotificationPriority;
    actionLabel?: string;
    referenceId?: string;
    referenceType?: string;
    emailSubject?: string;
    emailBody?: string;
  }): Promise<void> {
    await this.prisma.adminNotificationEvent.create({
      data: {
        adminId: params.adminId,
        eventType: params.eventType,
        referenceId: params.referenceId,
        referenceType: params.referenceType,
        payload: {
          title: params.title,
          body: params.body,
          href: params.href,
          priority: params.priority,
          actionLabel: params.actionLabel,
          eventType: params.eventType,
        },
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });

    if (params.emailSubject && params.emailBody) {
      await this.email.send({
        to: params.adminEmail,
        subject: params.emailSubject,
        text: params.emailBody,
      });
    }
  }

  async notifyHostRegistration(params: {
    doctorName: string;
    clinicLocation: string;
    userId: string;
  }): Promise<void> {
    const copy = buildA001HostRegistration(params);
    await this.notifyAllAdmins({
      eventType: 'A_001_NEW_HOST_REGISTRATION',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.href,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.userId,
      referenceType: 'User',
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  async notifyLocumRegistration(params: {
    doctorName: string;
    specialty: string;
    userId: string;
  }): Promise<void> {
    const copy = buildA002LocumRegistration(params);
    await this.notifyAllAdmins({
      eventType: 'A_002_NEW_LOCUM_REGISTRATION',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.href,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.userId,
      referenceType: 'User',
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  async notifyCredentialUploaded(params: {
    doctorName: string;
    credentialType: string;
    profileId: string;
    profileType: 'LocumProfile' | 'HostProfile';
  }): Promise<void> {
    const copy = buildA003CredentialUploaded(params);
    await this.notifyAllAdmins({
      eventType: 'A_003_CREDENTIAL_UPLOADED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.href,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.profileId,
      referenceType: params.profileType,
    });
  }

  async notifyAccountFlagged(params: {
    doctorName: string;
    reason: string;
    reporter: string;
    userId: string;
    reportId?: string;
    alsoBlocked?: boolean;
  }): Promise<void> {
    const copy = buildA004AccountFlagged(params);
    await this.notifyAllAdmins({
      eventType: 'A_004_ACCOUNT_FLAGGED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.href,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.userId,
      referenceType: 'User',
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  async notifyCpsnsUpdated(params: {
    doctorName: string;
    changeType: 'number' | 'document';
    profileId: string;
    profileType: 'LocumProfile' | 'HostProfile';
  }): Promise<void> {
    const copy = buildA005CpsnsUpdated(params);
    await this.notifyAllAdmins({
      eventType: 'A_005_CPSNS_UPDATED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.href,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.profileId,
      referenceType: params.profileType,
    });
  }

  async getNotifications(adminId: string): Promise<{
    total: number;
    notifications: AdminNotificationItem[];
  }> {
    const events = await this.prisma.adminNotificationEvent.findMany({
      where: { adminId },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    const notifications: AdminNotificationItem[] = events.map((e) => {
      const payload = (e.payload ?? {}) as {
        title?: string;
        body?: string;
        href?: string;
        priority?: AdminNotificationPriority;
        actionLabel?: string;
        eventType?: string;
      };
      return {
        id: e.id,
        type: eventTypeToCategory(e.eventType),
        title: payload.title ?? e.eventType,
        body: payload.body ?? '',
        href: payload.href ?? '/admin',
        read: e.deliveryStatus === 'READ',
        createdAt: e.sentAt.toISOString(),
        priority: payload.priority,
        actionLabel: payload.actionLabel,
        eventType: payload.eventType ?? e.eventType,
      };
    });

    const unread = notifications.filter((n) => !n.read).length;
    return { total: unread, notifications };
  }

  async markRead(adminId: string, notifId: string): Promise<void> {
    await this.prisma.adminNotificationEvent.updateMany({
      where: { id: notifId, adminId },
      data: { deliveryStatus: 'READ' },
    });
  }

  async markAllRead(adminId: string): Promise<void> {
    await this.prisma.adminNotificationEvent.updateMany({
      where: { adminId, deliveryStatus: { not: 'READ' } },
      data: { deliveryStatus: 'READ' },
    });
  }
}
