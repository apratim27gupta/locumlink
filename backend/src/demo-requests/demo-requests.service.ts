import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';

const DUPLICATE_DEMO_MESSAGE =
  'We already have a demo request for this email. Our team will be in touch.';

/** Inbox for every new public demo request. */
const DEMO_REQUEST_NOTIFY_EMAIL = 'doctor@locumlink.ca';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.trim().replace(/\s+/g, ' ');
}

@Injectable()
export class DemoRequestsService {
  private readonly logger = new Logger(DemoRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

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

      void this.notifyDoctorInbox({
        id: created.id,
        email: created.email,
        phone: created.phone,
        notes: created.notes,
        createdAt: created.createdAt,
      }).catch((err) => {
        this.logger.warn(
          `Demo request saved (${created.id}) but notify email failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
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

  private async notifyDoctorInbox(params: {
    id: string;
    email: string;
    phone: string;
    notes: string | null;
    createdAt: Date;
  }) {
    const when = params.createdAt.toISOString();
    const notesBlock = params.notes?.trim()
      ? params.notes.trim()
      : '(none)';
    const subject = `New LocumLink demo request — ${params.email}`;
    const text = [
      'A new demo request was submitted on LocumLink.',
      '',
      `Email: ${params.email}`,
      `Phone: ${params.phone}`,
      `Notes: ${notesBlock}`,
      `Submitted: ${when}`,
      `Request ID: ${params.id}`,
      '',
      'Review in Admin → Demo requests.',
    ].join('\n');
    const html = `
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">
        A new demo request was submitted on LocumLink.
      </p>
      <table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">
        <tr><td style="padding:4px 12px 4px 0;font-weight:700">Email</td><td style="padding:4px 0">${escapeHtml(params.email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:700">Phone</td><td style="padding:4px 0">${escapeHtml(params.phone)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:700;vertical-align:top">Notes</td><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(notesBlock)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:700">Submitted</td><td style="padding:4px 0">${escapeHtml(when)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:700">Request ID</td><td style="padding:4px 0">${escapeHtml(params.id)}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#4b5563">
        Review in Admin → Demo requests.
      </p>
    `;

    const result = await this.email.send({
      to: DEMO_REQUEST_NOTIFY_EMAIL,
      subject,
      text,
      html,
    });
    if (!result.ok) {
      this.logger.warn(
        `Demo request notify to ${DEMO_REQUEST_NOTIFY_EMAIL} failed: ${result.error}`,
      );
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
