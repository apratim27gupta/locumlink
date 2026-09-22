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
  | 'A_005_CPSNS_UPDATED'
  | 'A_006_MATCH_FEE_OVERDUE'
  | 'A_007_MATCH_FEE_OUTCOME';

export type AdminNotificationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'NORMAL';

export type AdminNotificationItem = {
  id: string;
  type: 'registration' | 'credential' | 'flagged' | 'payment';
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
  if (eventType.includes('MATCH_FEE')) return 'payment';
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

  async notifyMatchFeeOverdueEscalation(params: {
    invoiceId: string;
    hostPracticeName: string;
    jobTitle: string;
    amountCents: number;
  }): Promise<void> {
    const amount = (params.amountCents / 100).toFixed(0);
    await this.notifyAllAdmins({
      eventType: 'A_006_MATCH_FEE_OVERDUE',
      title: 'Overdue match fee needs review',
      body: `${params.hostPracticeName} has a $${amount} match fee overdue 30+ days for ${params.jobTitle}.`,
      href: '/admin/payments',
      priority: 'HIGH',
      actionLabel: 'Review Invoice',
      referenceId: params.invoiceId,
      referenceType: 'MatchFeeInvoice',
      emailSubject: `Overdue match fee: ${params.hostPracticeName}`,
      emailBody: `${params.hostPracticeName} has an overdue $${amount} LocumLink match fee for ${params.jobTitle}. Review in the admin payments dashboard.`,
    });
  }

  async notifyMatchFeeOutcome(params: {
    invoiceId: string;
    hostPracticeName: string;
    jobTitle: string;
    outcome:
      | 'INVOICE_VOIDED'
      | 'REFUND_ISSUED'
      | 'FEE_NON_REFUNDABLE'
      | 'REPLACEMENT_SEARCHING';
    detail: string;
  }): Promise<void> {
    const titles: Record<typeof params.outcome, string> = {
      INVOICE_VOIDED: 'Match fee invoice voided',
      REFUND_ISSUED: 'Match fee refunded',
      FEE_NON_REFUNDABLE: 'Match fee held (no refund)',
      REPLACEMENT_SEARCHING: 'Match fee: replacement search',
    };
    await this.notifyAllAdmins({
      eventType: 'A_007_MATCH_FEE_OUTCOME',
      title: titles[params.outcome],
      body: `${params.hostPracticeName} · ${params.jobTitle}. ${params.detail}`,
      href: '/admin/payments',
      priority: params.outcome === 'FEE_NON_REFUNDABLE' ? 'HIGH' : 'MEDIUM',
      actionLabel: 'View match fees',
      referenceId: params.invoiceId,
      referenceType: 'MatchFeeInvoice',
      emailSubject: `${titles[params.outcome]}: ${params.hostPracticeName}`,
      emailBody: `${params.hostPracticeName} - ${params.jobTitle}. ${params.detail} Review in admin Match Fees.`,
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
