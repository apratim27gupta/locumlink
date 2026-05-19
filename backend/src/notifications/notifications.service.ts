import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
export type NotificationItem = {
    id: string;
    type: 'message' | 'application' | 'shortlisted';
    title: string;
    body: string;
    href: string;
    createdAt: Date;
};
@Injectable()
export class NotificationsService {
    constructor(private readonly prisma: PrismaService) { }
    async getNotifications(userId: string, role: string): Promise<{
        total: number;
        notifications: NotificationItem[];
    }> {
        const notifications: NotificationItem[] = [];
        const unreadGroups = await this.prisma.message.groupBy({
            by: ['senderId'],
            where: { recipientId: userId, readAt: null, deletedAt: null },
            _count: { id: true },
            _max: { sentAt: true },
        });
        if (unreadGroups.length > 0) {
            const senderIds = unreadGroups.map((g) => g.senderId);
            const unreadCountBySender = new Map(unreadGroups.map((g) => [g.senderId, g._count.id]));
            const latestUnread = await this.prisma.message.findMany({
                where: {
                    recipientId: userId,
                    readAt: null,
                    deletedAt: null,
                    senderId: { in: senderIds },
                },
                orderBy: { sentAt: 'desc' },
                distinct: ['senderId'],
                include: {
                    sender: {
                        select: {
                            id: true,
                            locumProfile: { select: { firstName: true, lastName: true } },
                            hostProfile: { select: { contactFirstName: true, contactLastName: true, practiceName: true } },
                        },
                    },
                },
            });
            for (const msg of latestUnread) {
                const s = msg.sender;
                const senderName = s.locumProfile?.firstName
                    ? `Dr ${s.locumProfile.firstName} ${s.locumProfile.lastName ?? ''}`.trim()
                    : s.hostProfile?.contactFirstName
                        ? `Dr ${s.hostProfile.contactFirstName} ${s.hostProfile.contactLastName ?? ''}`.trim()
                        : s.hostProfile?.practiceName ?? 'Someone';
                const unreadCount = unreadCountBySender.get(msg.senderId) ?? 1;
                const href = role === 'HOST'
                    ? `/host/messages?partnerId=${msg.senderId}`
                    : `/locum/messages?partnerId=${msg.senderId}`;
                notifications.push({
                    id: `msg-${msg.senderId}`,
                    type: 'message',
                    title: `${unreadCount > 1 ? `${unreadCount} new messages` : 'New message'} from ${senderName}`,
                    body: msg.deletedAt ? 'Message deleted' : msg.body.slice(0, 80),
                    href,
                    createdAt: msg.sentAt,
                });
            }
        }
        if (role === 'HOST') {
            const hostProfile = await this.prisma.hostProfile.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (hostProfile) {
                const newApps = await this.prisma.application.findMany({
                    where: {
                        jobPosting: { hostProfileId: hostProfile.id },
                        status: 'APPLIED',
                    },
                    orderBy: { appliedAt: 'desc' },
                    include: {
                        locumProfile: { select: { firstName: true, lastName: true } },
                        jobPosting: { select: { id: true, title: true } },
                    },
                });
                const byJob = new Map<string, typeof newApps>();
                for (const app of newApps) {
                    const key = app.jobPosting.id;
                    if (!byJob.has(key))
                        byJob.set(key, []);
                    byJob.get(key)!.push(app);
                }
                for (const [, apps] of byJob) {
                    const first = apps[0];
                    const count = apps.length;
                    const name = first.locumProfile.firstName
                        ? `Dr ${first.locumProfile.firstName} ${first.locumProfile.lastName ?? ''}`.trim()
                        : 'A locum';
                    notifications.push({
                        id: `app-${first.jobPosting.id}`,
                        type: 'application',
                        title: count > 1
                            ? `${count} new applications for "${first.jobPosting.title}"`
                            : `${name} applied to "${first.jobPosting.title}"`,
                        body: count > 1
                            ? `${name} and ${count - 1} other${count > 2 ? 's' : ''} applied`
                            : 'Tap to review applicants',
                        href: `/host/applicants/${first.jobPosting.id}`,
                        createdAt: first.appliedAt,
                    });
                }
            }
        }
        if (role === 'LOCUM') {
            const locumProfile = await this.prisma.locumProfile.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (locumProfile) {
                const shortlisted = await this.prisma.application.findMany({
                    where: {
                        locumProfileId: locumProfile.id,
                        status: 'SHORTLISTED',
                    },
                    orderBy: { appliedAt: 'desc' },
                    include: {
                        jobPosting: {
                            include: {
                                hostProfile: { select: { practiceName: true, contactFirstName: true, contactLastName: true, id: true, userId: true } },
                            },
                        },
                    },
                });
                for (const app of shortlisted) {
                    const clinic = app.jobPosting.hostProfile.practiceName;
                    notifications.push({
                        id: `short-${app.id}`,
                        type: 'shortlisted',
                        title: `You've been shortlisted! 🎉`,
                        body: `${clinic} shortlisted you for "${app.jobPosting.title}"`,
                        href: `/locum/messages?partnerId=${app.jobPosting.hostProfile.userId}`,
                        createdAt: app.appliedAt,
                    });
                }
            }
        }
        notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return { total: notifications.length, notifications };
    }
}
