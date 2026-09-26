import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SupportTicketStatus } from '../prisma/prisma-client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  platformCalendarDateOf,
  platformCalendarDateToday,
} from '../host/job-schedule.util.js';

const MAX_MESSAGE = 2000;

function isPostingCompletedForTicket(posting: {
  status: string;
  endDate: Date | string | null;
}): boolean {
  if (posting.status === 'COMPLETED') return true;
  if (!posting.endDate) return false;
  const end =
    posting.endDate instanceof Date
      ? posting.endDate
      : new Date(posting.endDate);
  return platformCalendarDateOf(end) < platformCalendarDateToday();
}

@Injectable()
export class SupportTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async createHostTicket(
    userId: string,
    params: {
      jobPostingId: string;
      message: string;
      matchFeeInvoiceId: string;
    },
  ) {
    const message = params.message.trim();
    if (!message) {
      throw new BadRequestException('Describe the issue so we can help.');
    }
    if (message.length > MAX_MESSAGE) {
      throw new BadRequestException(
        `Message must be at most ${MAX_MESSAGE} characters.`,
      );
    }
    if (!params.matchFeeInvoiceId?.trim()) {
      throw new BadRequestException(
        'Tickets must be linked to a match fee invoice.',
      );
    }

    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found.');

    const posting = await this.prisma.jobPosting.findFirst({
      where: { id: params.jobPostingId, hostProfileId: hostProfile.id },
      select: { id: true, status: true, endDate: true, title: true },
    });
    if (!posting) throw new NotFoundException('Job posting not found.');
    if (!isPostingCompletedForTicket(posting)) {
      throw new BadRequestException(
        'You can raise a ticket only after the last shift on this invoice is completed.',
      );
    }

    const invoice = await this.prisma.matchFeeInvoice.findFirst({
      where: {
        id: params.matchFeeInvoiceId,
        hostProfileId: hostProfile.id,
        jobPostingId: posting.id,
      },
      select: { id: true },
    });
    if (!invoice) {
      throw new BadRequestException(
        'Match fee invoice not found for this posting.',
      );
    }

    const existing = await this.prisma.supportTicket.findUnique({
      where: { matchFeeInvoiceId: invoice.id },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new ConflictException(
        'A ticket already exists for this invoice. LocumLink will follow up on that ticket.',
      );
    }

    let ticket: {
      id: string;
      status: SupportTicketStatus;
      createdAt: Date;
      jobPostingId: string;
      matchFeeInvoiceId: string;
    };
    try {
      ticket = await this.prisma.supportTicket.create({
        data: {
          hostProfileId: hostProfile.id,
          jobPostingId: posting.id,
          matchFeeInvoiceId: invoice.id,
          message,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          jobPostingId: true,
          matchFeeInvoiceId: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A ticket already exists for this invoice. LocumLink will follow up on that ticket.',
        );
      }
      throw err;
    }

    await this.prisma.matchFeeInvoiceEvent.create({
      data: {
        invoiceId: invoice.id,
        eventType: 'TICKET_OPENED',
        actor: 'HOST',
        detail: message.length > 400 ? `${message.slice(0, 400)}…` : message,
      },
    });

    return {
      success: true,
      ticket: {
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
        jobTitle: posting.title,
      },
    };
  }

  async listForHost(userId: string) {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!hostProfile) throw new NotFoundException('Host profile not found.');

    const rows = await this.prisma.supportTicket.findMany({
      where: { hostProfileId: hostProfile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        jobPosting: { select: { id: true, title: true } },
        matchFeeInvoice: {
          select: { id: true, amountCents: true, status: true },
        },
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        jobPostingId: row.jobPostingId,
        jobTitle: row.jobPosting.title,
        matchFeeInvoiceId: row.matchFeeInvoiceId,
        invoiceAmountCents: row.matchFeeInvoice?.amountCents ?? null,
        invoiceStatus: row.matchFeeInvoice?.status ?? null,
      })),
    };
  }

  async listForAdmin(status?: string) {
    const where =
      status && ['OPEN', 'RESOLVED', 'DISMISSED'].includes(status)
        ? { status: status as SupportTicketStatus }
        : {};

    const rows = await this.prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        jobPosting: {
          select: { id: true, title: true, status: true, endDate: true },
        },
        hostProfile: {
          select: {
            id: true,
            practiceName: true,
            contactFirstName: true,
            contactLastName: true,
            user: { select: { email: true } },
          },
        },
        matchFeeInvoice: {
          select: {
            id: true,
            amountCents: true,
            refundedCents: true,
            status: true,
            currency: true,
            application: {
              select: {
                locumProfile: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
            replacementApplication: {
              select: {
                locumProfile: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
            events: {
              orderBy: { occurredAt: 'asc' },
              select: {
                id: true,
                eventType: true,
                detail: true,
                actor: true,
                occurredAt: true,
              },
            },
          },
        },
      },
    });

    return {
      items: rows.map((row) => {
        const hostName = [
          row.hostProfile.contactFirstName,
          row.hostProfile.contactLastName,
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
        return {
          id: row.id,
          status: row.status,
          message: row.message,
          adminNotes: row.adminNotes,
          createdAt: row.createdAt.toISOString(),
          resolvedAt: row.resolvedAt?.toISOString() ?? null,
          jobPostingId: row.jobPostingId,
          jobTitle: row.jobPosting.title,
          postingStatus: row.jobPosting.status,
          hostProfileId: row.hostProfile.id,
          hostPracticeName: row.hostProfile.practiceName,
          hostName: hostName || row.hostProfile.practiceName,
          hostEmail: row.hostProfile.user.email,
          matchFeeInvoiceId: row.matchFeeInvoiceId,
          invoice: row.matchFeeInvoice
            ? {
                id: row.matchFeeInvoice.id,
                amountCents: row.matchFeeInvoice.amountCents,
                refundedCents: row.matchFeeInvoice.refundedCents,
                status: row.matchFeeInvoice.status,
                currency: row.matchFeeInvoice.currency,
                locumName: [
                  row.matchFeeInvoice.application.locumProfile.firstName,
                  row.matchFeeInvoice.application.locumProfile.lastName,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .trim() || 'Locum',
                replacedByLocumName: row.matchFeeInvoice.replacementApplication
                  ? [
                      row.matchFeeInvoice.replacementApplication.locumProfile
                        .firstName,
                      row.matchFeeInvoice.replacementApplication.locumProfile
                        .lastName,
                    ]
                      .filter(Boolean)
                      .join(' ')
                      .trim() || 'Locum'
                  : null,
                remainingRefundableCents: Math.max(
                  0,
                  row.matchFeeInvoice.amountCents -
                    row.matchFeeInvoice.refundedCents,
                ),
                events: row.matchFeeInvoice.events.map((e) => ({
                  id: e.id,
                  eventType: e.eventType,
                  detail: e.detail,
                  actor: e.actor,
                  occurredAt: e.occurredAt.toISOString(),
                })),
              }
            : null,
        };
      }),
    };
  }

  async resolveTicket(
    ticketId: string,
    params: { status: 'RESOLVED' | 'DISMISSED'; adminNotes?: string },
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, matchFeeInvoiceId: true, message: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const notes = params.adminNotes?.trim() || undefined;
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: params.status,
        adminNotes: notes,
        resolvedAt: new Date(),
      },
      select: { id: true, status: true, resolvedAt: true, matchFeeInvoiceId: true },
    });

    if (updated.matchFeeInvoiceId) {
      await this.prisma.matchFeeInvoiceEvent.create({
        data: {
          invoiceId: updated.matchFeeInvoiceId,
          eventType: 'TICKET_RESOLVED',
          actor: 'ADMIN',
          detail: [
            `Ticket ${params.status.toLowerCase()}`,
            notes ? `Notes: ${notes}` : null,
          ]
            .filter(Boolean)
            .join(' — '),
        },
      });
      if (notes) {
        await this.prisma.matchFeeInvoice.update({
          where: { id: updated.matchFeeInvoiceId },
          data: { adminNotes: notes },
        });
      }
    }

    return {
      success: true,
      ticket: {
        id: updated.id,
        status: updated.status,
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      },
    };
  }
}
