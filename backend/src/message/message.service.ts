import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Conversations ─────────────────────────────────────────────────────────

  async getConversations(userId: string) {
    const [messages, unreadGroups] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          OR: [{ senderId: userId }, { recipientId: userId }],
          // Exclude messages deleted for everyone from conversation preview
        },
        orderBy: { sentAt: 'desc' },
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

  // ── Thread ────────────────────────────────────────────────────────────────

  async getThread(userId: string, partnerId: string) {
    await this.prisma.message.updateMany({
      where: { senderId: partnerId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    const [messages, partner] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId, recipientId: partnerId },
            { senderId: partnerId, recipientId: userId },
          ],
        },
        orderBy: { sentAt: 'asc' },
        include: { sender: { select: userSelect } },
      }),
      this.prisma.user.findUnique({
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
      }),
    ]);

    return { messages, partner };
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async sendMessage(
    senderId: string,
    recipientId: string,
    body: string,
    jobPostingId?: string,
  ) {
    const message = await this.prisma.message.create({
      data: {
        senderId,
        recipientId,
        body,
        jobPostingId: jobPostingId ?? null,
      },
      include: { sender: { select: userSelect } },
    });
    return { message };
  }

  // ── Edit (sender only) ────────────────────────────────────────────────────

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

  // ── Delete for everyone (sender only, soft-delete) ────────────────────────
  // "Delete for me only" is handled entirely client-side — no backend call needed.

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
