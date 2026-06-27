import { PushService } from '../notifications/push.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  paginateMessages,
  parsePaginationParams,
} from '../common/pagination/index.js';
import { GcsService } from '../gcs/gcs.service.js';
import { assertOwnsStoragePath } from '../common/utils/storage-path.util.js';
const userSelect = {
  id: true,
  email: true,
  role: true,
  locumProfile: { select: { firstName: true, lastName: true } },
  hostProfile: {
    select: {
      contactFirstName: true,
      contactLastName: true,
      practiceName: true,
    },
  },
} as const;
/** Cap rows loaded when building the inbox list (avoids OOM on busy accounts). */
const CONVERSATION_SCAN_LIMIT = 400;
@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly gcs: GcsService,
    private readonly notifService: NotificationsService,
  ) {}
  private async signAttachments<
    T extends {
      attachments?: {
        storagePath: string;
        [k: string]: unknown;
      }[];
    },
  >(messages: T[]): Promise<T[]> {
    return Promise.all(
      messages.map(async (m) => ({
        ...m,
        attachments: await Promise.all(
          (m.attachments ?? []).map(async (a) => ({
            ...a,
            signedUrl: await this.gcs.signedUrl(a.storagePath),
          })),
        ),
      })),
    );
  }
  async getConversations(userId: string, search?: string) {
    const trimmed = search?.trim() ?? '';
    const hasSearch = trimmed.length > 0;
    let partnerIdFilter: string[] | null = null;
    if (hasSearch) {
      const partnerIds = new Set<string>();
      const [bodyMsgs, attachMsgs, jobMsgs, profileUsers] = await Promise.all([
        this.prisma.message.findMany({
          where: {
            OR: [{ senderId: userId }, { recipientId: userId }],
            deletedAt: null,
            body: { contains: trimmed, mode: 'insensitive' },
          },
          select: { senderId: true, recipientId: true },
        }),
        this.prisma.message.findMany({
          where: {
            OR: [{ senderId: userId }, { recipientId: userId }],
            deletedAt: null,
            attachments: {
              some: { fileName: { contains: trimmed, mode: 'insensitive' } },
            },
          },
          select: { senderId: true, recipientId: true },
        }),
        this.prisma.message.findMany({
          where: {
            OR: [{ senderId: userId }, { recipientId: userId }],
            deletedAt: null,
            jobPosting: {
              is: { title: { contains: trimmed, mode: 'insensitive' } },
            },
          },
          select: { senderId: true, recipientId: true },
        }),
        this.prisma.user.findMany({
          where: {
            id: { not: userId },
            AND: [
              {
                OR: [
                  { email: { contains: trimmed, mode: 'insensitive' } },
                  {
                    locumProfile: {
                      is: {
                        OR: [
                          {
                            firstName: {
                              contains: trimmed,
                              mode: 'insensitive',
                            },
                          },
                          {
                            lastName: {
                              contains: trimmed,
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                    },
                  },
                  {
                    hostProfile: {
                      is: {
                        OR: [
                          {
                            contactFirstName: {
                              contains: trimmed,
                              mode: 'insensitive',
                            },
                          },
                          {
                            contactLastName: {
                              contains: trimmed,
                              mode: 'insensitive',
                            },
                          },
                          {
                            practiceName: {
                              contains: trimmed,
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
              {
                OR: [
                  { sentMessages: { some: { recipientId: userId } } },
                  { receivedMessages: { some: { senderId: userId } } },
                ],
              },
            ],
          },
          select: { id: true },
        }),
      ]);
      const pushPartner = (senderId: string, recipientId: string) => {
        partnerIds.add(senderId === userId ? recipientId : senderId);
      };
      for (const m of bodyMsgs) pushPartner(m.senderId, m.recipientId);
      for (const m of attachMsgs) pushPartner(m.senderId, m.recipientId);
      for (const m of jobMsgs) pushPartner(m.senderId, m.recipientId);
      for (const u of profileUsers) partnerIds.add(u.id);
      if (partnerIds.size === 0) return { conversations: [] };
      partnerIdFilter = [...partnerIds];
    }
    const participantClause = {
      OR: [{ senderId: userId }, { recipientId: userId }],
    };
    const whereClause = partnerIdFilter
      ? {
          AND: [
            participantClause,
            {
              OR: [
                { senderId: userId, recipientId: { in: partnerIdFilter } },
                { recipientId: userId, senderId: { in: partnerIdFilter } },
              ],
            },
          ],
        }
      : participantClause;
    const [messages, unreadGroups] = await Promise.all([
      this.prisma.message.findMany({
        where: whereClause,
        orderBy: { sentAt: 'desc' },
        take: CONVERSATION_SCAN_LIMIT,
        include: {
          sender: { select: userSelect },
          recipient: { select: userSelect },
          jobPosting: { select: { id: true, title: true } },
        },
      }),
      this.prisma.message.groupBy({
        by: ['senderId'],
        where: { recipientId: userId, readAt: null, deletedAt: null },
        _count: { id: true },
      }),
    ]);
    const unreadByPartner = new Map<string, number>();
    for (const g of unreadGroups) {
      unreadByPartner.set(g.senderId, g._count.id);
    }
    const seen = new Set<string>();
    const conversations = [];
    for (const msg of messages) {
      const partnerId =
        msg.senderId === userId ? msg.recipientId : msg.senderId;
      if (seen.has(partnerId)) continue;
      seen.add(partnerId);
      const partner = msg.senderId === userId ? msg.recipient : msg.sender;
      conversations.push({
        partnerId,
        partner,
        lastMessage: {
          id: msg.id,
          body: msg.deletedAt ? '' : msg.body,
          sentAt: msg.sentAt,
          senderId: msg.senderId,
          deletedAt: msg.deletedAt,
          jobPosting: msg.jobPosting,
        },
        unreadCount: unreadByPartner.get(partnerId) ?? 0,
      });
    }
    return { conversations };
  }
  async getThread(
    userId: string,
    partnerId: string,
    since?: Date,
    query: Record<string, unknown> = {},
  ) {
    const isDelta = since != null;
    if (isDelta) {
      const threadWhere = {
        OR: [
          { senderId: userId, recipientId: partnerId },
          { senderId: partnerId, recipientId: userId },
        ],
        sentAt: { gt: since },
        deletedAt: null,
      };
      const messages = await this.prisma.message.findMany({
        where: threadWhere,
        orderBy: { sentAt: 'asc' },
        include: {
          sender: { select: userSelect },
          attachments: true,
        },
      });
      const withSigned = await this.signAttachments(messages);
      return {
        items: withSigned,
        nextCursor: null,
        hasNextPage: false,
        partner: null,
      };
    }

    await this.prisma.message.updateMany({
      where: { senderId: partnerId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    const pagination = parsePaginationParams(query, 50);
    pagination.direction = 'desc';

    const page = await paginateMessages(
      this.prisma,
      { senderId: userId, recipientId: partnerId },
      pagination,
      {
        sender: { select: userSelect },
        attachments: true,
      },
    );

    const withSigned = await this.signAttachments(
      [...page.items].sort(
        (a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
      ),
    );

    const conversationExists = await this.prisma.message.findFirst({
      where: {
        OR: [
          { senderId: userId, recipientId: partnerId },
          { senderId: partnerId, recipientId: userId },
        ],
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!conversationExists) {
      return {
        items: [],
        nextCursor: null,
        hasNextPage: false,
        partner: null,
      };
    }

    const partner = await this.prisma.user.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        email: true,
        role: true,
        locumProfile: {
          select: {
            firstName: true,
            lastName: true,
            specializationText: true,
            specialty: true,
            city: true,
            province: true,
          },
        },
        hostProfile: {
          select: {
            contactFirstName: true,
            contactLastName: true,
            practiceName: true,
            city: true,
            province: true,
          },
        },
      },
    });

    return {
      items: withSigned,
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
      partner,
    };
  }
  async sendMessage(
    senderId: string,
    recipientId: string,
    body: string | undefined,
    jobPostingId?: string,
    attachments: {
      storagePath: string;
      fileName: string;
      mimeType: string;
      size: number;
    }[] = [],
  ) {
    const trimmed = (body ?? '').trim();
    if (!trimmed && (!attachments || attachments.length === 0)) {
      throw new ForbiddenException('Message body or attachment is required');
    }
    for (const a of attachments ?? []) {
      assertOwnsStoragePath(a.storagePath, senderId);
    }
    const message = await this.prisma.message.create({
      data: {
        senderId,
        recipientId,
        body: trimmed,
        jobPostingId: jobPostingId ?? null,
        attachments: attachments?.length
          ? {
              create: attachments.map((a) => ({
                storagePath: a.storagePath,
                fileName: a.fileName,
                mimeType: a.mimeType,
                size: a.size,
              })),
            }
          : undefined,
      },
      include: { sender: { select: userSelect }, attachments: true },
    });
    const [signed] = await this.signAttachments([message]);
    // H-004 / L-008: notify recipient of new message
    try {
      const senderName = message.sender?.locumProfile?.firstName
        ? `Dr ${message.sender.locumProfile.firstName} ${message.sender.locumProfile.lastName ?? ''}`.trim()
        : message.sender?.hostProfile?.contactFirstName
          ? `Dr ${message.sender.hostProfile.contactFirstName} ${message.sender.hostProfile.contactLastName ?? ''}`.trim()
          : 'Someone';
      const recipient = await this.prisma.user.findUnique({
        where: { id: recipientId },
        select: { role: true, email: true },
      });
      const preview = trimmed.slice(0, 80) || 'Sent an attachment';
      const isRecipientHost = recipient?.role === 'HOST';
      if (isRecipientHost && recipient.email) {
        let jobTitle = 'your posting';
        if (jobPostingId) {
          const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobPostingId },
            select: { title: true },
          });
          if (job?.title) jobTitle = job.title;
        }
        const locumName = message.sender?.locumProfile?.firstName
          ? `Dr. ${[message.sender.locumProfile.firstName, message.sender.locumProfile.lastName].filter(Boolean).join(' ').trim()}`
          : senderName;
        await this.notifService.notifyHostNewMessage({
          recipientId,
          recipientEmail: recipient.email,
          senderId,
          locumName,
          jobTitle,
          preview,
          messageId: message.id,
        });
      } else if (recipient?.email) {
        let jobTitle = 'shift';
        let startDate: Date | null = null;
        if (jobPostingId) {
          const job = await this.prisma.jobPosting.findUnique({
            where: { id: jobPostingId },
            select: { title: true, startDate: true },
          });
          if (job?.title) jobTitle = job.title;
          if (job?.startDate) startDate = job.startDate;
        }
        const hostProfile = message.sender?.hostProfile;
        await this.notifService.notifyLocumNewMessage({
          recipientId,
          recipientEmail: recipient.email,
          senderId,
          hostFirstName: hostProfile?.contactFirstName,
          hostLastName: hostProfile?.contactLastName,
          jobTitle,
          startDate,
          messageId: message.id,
        });
      }
    } catch {}
    return { message: signed };
  }
  async editMessage(userId: string, messageId: string, body: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId)
      throw new ForbiddenException('You can only edit your own messages');
    if (message.deletedAt)
      throw new ForbiddenException('Cannot edit a deleted message');
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
      include: { sender: { select: userSelect } },
    });
    return { message: updated };
  }
  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId)
      throw new ForbiddenException(
        'You can only delete for everyone your own messages',
      );
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
      include: { sender: { select: userSelect } },
    });
    return { message: updated };
  }
}
