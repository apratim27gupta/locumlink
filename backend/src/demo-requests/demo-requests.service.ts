import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const DUPLICATE_DEMO_MESSAGE =
  'We already have a demo request for this email. Our team will be in touch.';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.trim().replace(/\s+/g, ' ');
}

@Injectable()
export class DemoRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { email: string; phone: string; notes?: string }) {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const notes = input.notes?.trim() || null;

    const existing = await this.prisma.demoRequest.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(DUPLICATE_DEMO_MESSAGE);
    }

    try {
      const created = await this.prisma.demoRequest.create({
        data: { email, phone, notes },
      });

      return {
        id: created.id,
        email: created.email,
        phone: created.phone,
        createdAt: created.createdAt.toISOString(),
        duplicate: false as const,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(DUPLICATE_DEMO_MESSAGE);
      }
      throw err;
    }
  }

  async listForAdmin() {
    const rows = await this.prisma.demoRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        phone: r.phone,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
