import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';
import { EmailService } from './email.service.js';
import {
  buildL001NewOpportunity,
  buildL002HostConfirmed,
  buildL003ApplicationAccepted,
  buildL004ApplicationDeclined,
  buildL005ShiftReminder48h,
  buildL006ShiftReminderEvening,
  buildL007ShiftReminder2h,
  buildL008NewMessage,
  buildL012ShiftCancelled,
  contactSupportMailtoHref,
  formatLocumDoctorName,
  formatJobDate,
  formatPayPerDay,
  formatSuspensionReason,
  formatVerificationRejectionReason,
  locumBrowseHref,
  locumMessagesHref,
  L009_LOCUM_ACCOUNT_VERIFIED,
  L010_LOCUM_VERIFICATION_REJECTED,
  L011_LOCUM_ACCOUNT_SUSPENDED,
} from './notification-copy.js';
import {
  buildH001LocumApplied,
  buildH002LocumAccepted,
  buildH003LocumDeclined,
  buildH004NewMessage,
  buildH008PostingExpiring,
  buildH009ShiftCancelled,
  formatHostDoctorName,
  formatHostRejectionReason,
  H005_HOST_ACCOUNT_VERIFIED,
  H006_HOST_VERIFICATION_REJECTED,
  H007_HOST_ACCOUNT_SUSPENDED,
  hostMessagesHref,
} from './host-notification-copy.js';

export type NotifEventType =
  // Host
  | 'H_001_LOCUM_APPLIED'
  | 'H_002_LOCUM_ACCEPTED'
  | 'H_003_LOCUM_DECLINED'
  | 'H_004_NEW_MESSAGE'
  | 'H_005_ACCOUNT_VERIFIED'
  | 'H_006_ACCOUNT_REJECTED'
  | 'H_007_ACCOUNT_SUSPENDED'
  | 'H_008_POSTING_EXPIRING'
  | 'H_009_SHIFT_CANCELLED'
  // Locum
  | 'L_001_NEW_OPPORTUNITY'
  | 'L_002_HOST_CONFIRMED'
  | 'L_003_APPLICATION_ACCEPTED'
  | 'L_004_APPLICATION_DECLINED'
  | 'L_005_SHIFT_REMINDER_48H'
  | 'L_006_SHIFT_REMINDER_EVENING'
  | 'L_007_SHIFT_REMINDER_2H'
  | 'L_008_NEW_MESSAGE'
  | 'L_009_ACCOUNT_VERIFIED'
  | 'L_010_ACCOUNT_REJECTED'
  | 'L_011_ACCOUNT_SUSPENDED'
  | 'L_012_SHIFT_CANCELLED'
  // Admin
  | 'A_001_NEW_HOST_REGISTRATION'
  | 'A_002_NEW_LOCUM_REGISTRATION'
  | 'A_003_CREDENTIAL_UPLOADED'
  | 'A_004_ACCOUNT_FLAGGED';

export type NotificationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'NORMAL'
  | 'LOW';

export type NotificationItem = {
  id: string;
  type:
    | 'message'
    | 'application'
    | 'shortlisted'
    | 'reminder'
    | 'account'
    | 'cancellation'
    | 'registration'
    | 'credential'
    | 'flagged';
  category?:
    | 'messages'
    | 'applications'
    | 'reminders'
    | 'account'
    | 'cancellations';
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
  priority?: NotificationPriority;
  actionLabel?: string;
  eventType?: string;
};

function eventTypeToCategory(eventType: string): NotificationItem['type'] {
  if (eventType.includes('MESSAGE')) return 'message';
  if (
    eventType.includes('APPLIED') ||
    eventType.includes('ACCEPTED') ||
    eventType.includes('DECLINED') ||
    eventType.includes('CONFIRMED')
  )
    return 'application';
  if (eventType.includes('REMINDER') || eventType.includes('EXPIRING'))
    return 'reminder';
  if (eventType.includes('CANCELLED')) return 'cancellation';
  if (eventType.includes('REGISTRATION')) return 'registration';
  if (eventType.includes('CREDENTIAL')) return 'credential';
  if (eventType.includes('FLAGGED')) return 'flagged';
  if (
    eventType.includes('VERIFIED') ||
    eventType.includes('REJECTED') ||
    eventType.includes('SUSPENDED')
  )
    return 'account';
  return 'application';
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  async create(params: {
    recipientId: string;
    eventType: NotifEventType;
    title: string;
    body: string;
    href: string;
    referenceId?: string;
    referenceType?: string;
    pushTitle?: string;
    pushBody?: string;
    priority?: NotificationPriority;
    actionLabel?: string;
    emailTo?: string;
    emailSubject?: string;
    emailBody?: string;
  }): Promise<void> {
    await this.prisma.notificationEvent.create({
      data: {
        recipientId: params.recipientId,
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

    await this.push.sendToUser(params.recipientId, {
      title: params.pushTitle ?? params.title,
      body: params.pushBody ?? params.body,
      url: params.href,
    });

    if (params.emailTo && params.emailSubject && params.emailBody) {
      await this.email.send({
        to: params.emailTo,
        subject: params.emailSubject,
        text: params.emailBody,
      });
    }
  }

  /** L-001: new job posting for verified locums */
  async notifyLocumNewOpportunity(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    jobId: string;
    jobTitle: string;
    startDate?: Date | string | null;
    payPerDay?: number | null;
    city?: string | null;
    province?: string | null;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const dateStr = formatJobDate(params.startDate);
    const payStr = formatPayPerDay(params.payPerDay);
    const locationStr = [params.city, params.province]
      .filter(Boolean)
      .join(', ');
    const copy = buildL001NewOpportunity({
      doctorName,
      jobTitle: params.jobTitle,
      dateStr,
      payStr,
      locationStr,
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_001_NEW_OPPORTUNITY',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: locumBrowseHref(params.jobId),
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.jobId,
      referenceType: 'JobPosting',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-002: host confirmed locum for shift */
  async notifyLocumHostConfirmed(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    jobTitle: string;
    clinicName: string;
    startDate?: Date | string | null;
    applicationId: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = buildL002HostConfirmed({
      doctorName,
      jobTitle: params.jobTitle,
      clinicName: params.clinicName,
      dateStr: formatJobDate(params.startDate),
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_002_HOST_CONFIRMED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/locum/dashboard',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-003: application shortlisted by host */
  async notifyLocumApplicationAccepted(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    jobTitle: string;
    startDate?: Date | string | null;
    applicationId: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = buildL003ApplicationAccepted({
      doctorName,
      jobTitle: params.jobTitle,
      dateStr: formatJobDate(params.startDate),
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_003_APPLICATION_ACCEPTED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/locum/dashboard',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-004: application declined by host */
  async notifyLocumApplicationDeclined(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    jobTitle: string;
    applicationId: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = buildL004ApplicationDeclined({
      doctorName,
      jobTitle: params.jobTitle,
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_004_APPLICATION_DECLINED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/locum/browse',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-005: shift reminder 48 hours before */
  async notifyLocumShiftReminder48h(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    clinicName: string;
    startDate: Date | string;
    startTime?: string | null;
    applicationId: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = buildL005ShiftReminder48h({
      doctorName,
      clinicName: params.clinicName,
      dateStr: formatJobDate(params.startDate),
      timeStr: params.startTime?.trim() ?? '',
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_005_SHIFT_REMINDER_48H',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/locum/dashboard',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-006: evening-before shift reminder */
  async notifyLocumShiftReminderEvening(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    clinicName: string;
    startTime?: string | null;
    applicationId: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = buildL006ShiftReminderEvening({
      doctorName,
      clinicName: params.clinicName,
      timeStr: params.startTime?.trim() ?? '',
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_006_SHIFT_REMINDER_EVENING',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/locum/dashboard',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-007: shift reminder 2 hours before */
  async notifyLocumShiftReminder2h(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    clinicName: string;
    startTime?: string | null;
    applicationId: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = buildL007ShiftReminder2h({
      doctorName,
      clinicName: params.clinicName,
      timeStr: params.startTime?.trim() ?? '',
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_007_SHIFT_REMINDER_2H',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/locum/dashboard',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-008: new message received */
  async notifyLocumNewMessage(params: {
    recipientId: string;
    recipientEmail: string;
    senderId: string;
    senderName: string;
    preview: string;
    messageId: string;
  }): Promise<void> {
    const copy = buildL008NewMessage({
      senderName: params.senderName,
      preview: params.preview,
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_008_NEW_MESSAGE',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: locumMessagesHref(params.senderId),
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.messageId,
      referenceType: 'Message',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-012: host cancelled a confirmed shift */
  async notifyLocumShiftCancelled(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    clinicName: string;
    jobTitle: string;
    startDate?: Date | string | null;
    jobId: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = buildL012ShiftCancelled({
      doctorName,
      clinicName: params.clinicName,
      dateStr: formatJobDate(params.startDate),
      jobTitle: params.jobTitle,
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_012_SHIFT_CANCELLED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/locum/browse',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.jobId,
      referenceType: 'JobPosting',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** L-009: locum credential verification approved — in-app, push, and email. */
  async notifyLocumAccountVerified(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    referenceId?: string;
  }): Promise<void> {
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = L009_LOCUM_ACCOUNT_VERIFIED;
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_009_ACCOUNT_VERIFIED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.browseHref,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.referenceId,
      referenceType: 'LocumProfile',
      pushTitle: copy.inAppTitle,
      pushBody: copy.inAppBody,
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody(doctorName),
    });
  }

  /** L-010: locum credential verification rejected — in-app, push, and email. */
  async notifyLocumVerificationRejected(params: {
    recipientId: string;
    recipientEmail: string;
    firstName?: string | null;
    lastName?: string | null;
    rejectionReason?: string | null;
    referenceId?: string;
  }): Promise<void> {
    const reason = formatVerificationRejectionReason(params.rejectionReason);
    const doctorName = formatLocumDoctorName(params.firstName, params.lastName);
    const copy = L010_LOCUM_VERIFICATION_REJECTED;
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_010_ACCOUNT_REJECTED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.profileHref,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.referenceId,
      referenceType: 'LocumProfile',
      pushTitle: copy.inAppTitle,
      pushBody: copy.inAppBody,
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody(doctorName, reason),
    });
  }

  /** L-011: locum account suspended by admin — in-app, push, and email. */
  async notifyLocumAccountSuspended(params: {
    recipientId: string;
    recipientEmail: string;
    suspensionNote?: string | null;
    referenceId?: string;
  }): Promise<void> {
    const reason = formatSuspensionReason(params.suspensionNote);
    const copy = L011_LOCUM_ACCOUNT_SUSPENDED;
    await this.create({
      recipientId: params.recipientId,
      eventType: 'L_011_ACCOUNT_SUSPENDED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: contactSupportMailtoHref(),
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.referenceId,
      referenceType: 'User',
      pushTitle: copy.inAppTitle,
      pushBody: copy.inAppBody,
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody(reason),
    });
  }

  /** H-001: locum applied to host posting */
  async notifyHostLocumApplied(params: {
    recipientId: string;
    recipientEmail: string;
    locumFirstName?: string | null;
    locumLastName?: string | null;
    jobId: string;
    jobTitle: string;
    startDate?: Date | string | null;
    applicationId: string;
  }): Promise<void> {
    const locumName = formatLocumDoctorName(
      params.locumFirstName,
      params.locumLastName,
    );
    const copy = buildH001LocumApplied({
      locumName,
      jobTitle: params.jobTitle,
      dateStr: formatJobDate(params.startDate),
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_001_LOCUM_APPLIED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: `/host/applicants/${params.jobId}`,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** H-002: locum accepted confirmed placement */
  async notifyHostLocumAccepted(params: {
    recipientId: string;
    recipientEmail: string;
    locumFirstName?: string | null;
    locumLastName?: string | null;
    startDate?: Date | string | null;
    applicationId: string;
  }): Promise<void> {
    const locumName = formatLocumDoctorName(
      params.locumFirstName,
      params.locumLastName,
    );
    const copy = buildH002LocumAccepted({
      locumName,
      dateStr: formatJobDate(params.startDate),
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_002_LOCUM_ACCEPTED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/host/dashboard?postJob=1',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** H-003: locum declined confirmed placement */
  async notifyHostLocumDeclined(params: {
    recipientId: string;
    recipientEmail: string;
    locumFirstName?: string | null;
    locumLastName?: string | null;
    startDate?: Date | string | null;
    applicationId: string;
    jobId: string;
  }): Promise<void> {
    const locumName = formatLocumDoctorName(
      params.locumFirstName,
      params.locumLastName,
    );
    const copy = buildH003LocumDeclined({
      locumName,
      dateStr: formatJobDate(params.startDate),
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_003_LOCUM_DECLINED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/host/dashboard?postJob=1',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.applicationId,
      referenceType: 'Application',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** H-009: last-minute cancellation (<24h) — host alert */
  async notifyHostShiftCancelled(params: {
    recipientId: string;
    recipientEmail: string;
    startDate?: Date | string | null;
    clinicName: string;
    cancelledBy: string;
    reason: string;
    jobId: string;
  }): Promise<void> {
    const copy = buildH009ShiftCancelled({
      dateStr: formatJobDate(params.startDate),
      clinicName: params.clinicName,
      cancelledBy: params.cancelledBy,
      reason: params.reason,
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_009_SHIFT_CANCELLED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: '/host/dashboard?postJob=1',
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.jobId,
      referenceType: 'JobPosting',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** H-004: new message from locum */
  async notifyHostNewMessage(params: {
    recipientId: string;
    recipientEmail: string;
    senderId: string;
    locumName: string;
    jobTitle: string;
    preview: string;
    messageId: string;
  }): Promise<void> {
    const copy = buildH004NewMessage({
      locumName: params.locumName,
      jobTitle: params.jobTitle,
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_004_NEW_MESSAGE',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: hostMessagesHref(params.senderId),
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.messageId,
      referenceType: 'Message',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  /** H-005: host account verified */
  async notifyHostAccountVerified(params: {
    recipientId: string;
    recipientEmail: string;
    contactFirstName?: string | null;
    contactLastName?: string | null;
    referenceId?: string;
  }): Promise<void> {
    const hostName = formatHostDoctorName(
      params.contactFirstName,
      params.contactLastName,
    );
    const copy = H005_HOST_ACCOUNT_VERIFIED;
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_005_ACCOUNT_VERIFIED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.postJobHref,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.referenceId,
      referenceType: 'HostProfile',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody(hostName),
    });
  }

  /** H-006: host verification rejected */
  async notifyHostVerificationRejected(params: {
    recipientId: string;
    recipientEmail: string;
    contactFirstName?: string | null;
    contactLastName?: string | null;
    rejectionReason?: string | null;
    referenceId?: string;
  }): Promise<void> {
    const hostName = formatHostDoctorName(
      params.contactFirstName,
      params.contactLastName,
    );
    const reason = formatHostRejectionReason(params.rejectionReason);
    const copy = H006_HOST_VERIFICATION_REJECTED;
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_006_ACCOUNT_REJECTED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: copy.profileHref,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.referenceId,
      referenceType: 'HostProfile',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody(hostName, reason),
    });
  }

  /** H-007: host account suspended */
  async notifyHostAccountSuspended(params: {
    recipientId: string;
    recipientEmail: string;
    suspensionNote?: string | null;
    referenceId?: string;
  }): Promise<void> {
    const reason = formatSuspensionReason(params.suspensionNote);
    const copy = H007_HOST_ACCOUNT_SUSPENDED;
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_007_ACCOUNT_SUSPENDED',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: contactSupportMailtoHref(),
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.referenceId,
      referenceType: 'User',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody(reason),
    });
  }

  /** H-008: posting expiring in 48 hours */
  async notifyHostPostingExpiring(params: {
    recipientId: string;
    recipientEmail: string;
    jobId: string;
    jobTitle: string;
    startDate?: Date | string | null;
  }): Promise<void> {
    const copy = buildH008PostingExpiring({
      dateStr: formatJobDate(params.startDate),
      jobTitle: params.jobTitle,
    });
    await this.create({
      recipientId: params.recipientId,
      eventType: 'H_008_POSTING_EXPIRING',
      title: copy.inAppTitle,
      body: copy.inAppBody,
      href: `/host/jobs/${params.jobId}/edit`,
      priority: copy.priority,
      actionLabel: copy.actionLabel,
      referenceId: params.jobId,
      referenceType: 'JobPosting',
      emailTo: params.recipientEmail,
      emailSubject: copy.emailSubject,
      emailBody: copy.emailBody,
    });
  }

  async getNotifications(
    userId: string,
    _role: string,
  ): Promise<{
    total: number;
    notifications: NotificationItem[];
  }> {
    const events = await this.prisma.notificationEvent.findMany({
      where: { recipientId: userId },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    const notifications: NotificationItem[] = events.map((e) => {
      const payload = (e.payload ?? {}) as {
        title?: string;
        body?: string;
        href?: string;
        priority?: NotificationPriority;
        actionLabel?: string;
        eventType?: string;
      };
      return {
        id: e.id,
        type: eventTypeToCategory(e.eventType),
        title: payload.title ?? e.eventType,
        body: payload.body ?? '',
        href: payload.href ?? '/',
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

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notificationEvent.updateMany({
      where: { recipientId: userId, deliveryStatus: { not: 'READ' } },
      data: { deliveryStatus: 'READ' },
    });
  }

  async markRead(userId: string, notifId: string): Promise<void> {
    await this.prisma.notificationEvent.updateMany({
      where: { id: notifId, recipientId: userId },
      data: { deliveryStatus: 'READ' },
    });
  }
}
