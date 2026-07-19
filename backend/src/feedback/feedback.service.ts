import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_FEEDBACK_LENGTH = 2000;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(userId: string, message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new BadRequestException('Feedback message is required.');
    }
    if (trimmed.length > MAX_FEEDBACK_LENGTH) {
      throw new BadRequestException(
        `Feedback must be at most ${MAX_FEEDBACK_LENGTH} characters.`,
      );
    }

    const entry = await this.prisma.feedback.create({
      data: { userId, message: trimmed },
      select: { id: true, createdAt: true },
    });

    return { success: true, id: entry.id, createdAt: entry.createdAt };
  }

  async listForAdmin() {
    const rows = await this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            locumProfile: {
              select: { firstName: true, lastName: true },
            },
            hostProfile: {
              select: { contactFirstName: true, contactLastName: true, practiceName: true },
            },
          },
        },
      },
    });

    return {
      items: rows.map((row) => {
        const u = row.user;
        let name = '';
        if (u.role === 'LOCUM') {
          name = [u.locumProfile?.firstName, u.locumProfile?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();
        } else if (u.role === 'HOST') {
          name = [u.hostProfile?.contactFirstName, u.hostProfile?.contactLastName]
            .filter(Boolean)
            .join(' ')
            .trim();
          if (!name) name = u.hostProfile?.practiceName?.trim() ?? '';
        }
        return {
          id: row.id,
          message: row.message,
          createdAt: row.createdAt,
          user: {
            id: u.id,
            email: u.email,
            role: u.role,
            name: name || u.email,
          },
        };
      }),
    };
  }
}
