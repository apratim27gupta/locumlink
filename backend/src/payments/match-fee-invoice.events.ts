import type {
  MatchFeeCancelledBy,
  MatchFeeInvoice,
  MatchFeeInvoiceEvent,
  MatchFeeInvoiceEventActor,
  MatchFeeInvoiceEventType,
} from '@prisma/client';

export type MatchFeeInvoiceEventDto = {
  id: string;
  eventType: MatchFeeInvoiceEventType;
  label: string;
  detail: string | null;
  actor: MatchFeeInvoiceEventActor;
  occurredAt: string;
};

const EVENT_LABELS: Record<MatchFeeInvoiceEventType, string> = {
  INVOICED: 'Invoice issued',
  PAID: 'Payment received',
  OVERDUE: 'Invoice overdue',
  PAYMENT_REMINDER: 'Payment reminder sent',
  CANCELLED: 'Invoice cancelled',
  REPLACEMENT_SEARCHING: 'Replacement locum search started',
  REPLACEMENT_FOUND: 'Replacement locum confirmed',
  REPLACEMENT_NOT_FOUND: 'No replacement found',
  REFUNDED: 'Refund issued',
  ESCALATED: 'Escalated for admin review',
  ADMIN_NOTE: 'Admin update',
  POSTING_REMOVED: 'Job posting removed',
  FEE_NON_REFUNDABLE: 'Fee retained (no refund per policy)',
};

/** Normalize user-facing detail text (legacy rows may still contain em dashes). */
function sanitizeEventDetail(detail: string | null): string | null {
  if (detail == null) return null;
  return detail.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
}

export function mapMatchFeeEventRow(
  row: MatchFeeInvoiceEvent,
): MatchFeeInvoiceEventDto {
  return {
    id: row.id,
    eventType: row.eventType,
    label: EVENT_LABELS[row.eventType] ?? row.eventType,
    detail: sanitizeEventDetail(row.detail),
    actor: row.actor,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export function cancellationActorToEventActor(
  actor: MatchFeeCancelledBy | 'SYSTEM',
): MatchFeeInvoiceEventActor {
  if (actor === 'HOST') return 'HOST';
  if (actor === 'LOCUM') return 'LOCUM';
  if (actor === 'ADMIN') return 'ADMIN';
  return 'SYSTEM';
}

/** Reconstruct a readable timeline when no persisted events exist yet. */
export function synthesizeMatchFeeEvents(
  invoice: Pick<
    MatchFeeInvoice,
    | 'id'
    | 'status'
    | 'createdAt'
    | 'paidAt'
    | 'dueAt'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'replacementStatus'
    | 'escalatedAt'
    | 'lastReminderAt'
    | 'paymentProvider'
    | 'stripeRefundId'
  >,
): MatchFeeInvoiceEventDto[] {
  const items: MatchFeeInvoiceEventDto[] = [];
  const push = (
    eventType: MatchFeeInvoiceEventType,
    occurredAt: Date,
    detail?: string | null,
    actor: MatchFeeInvoiceEventActor = 'SYSTEM',
  ) => {
    items.push({
      id: `synthetic-${eventType}-${occurredAt.getTime()}`,
      eventType,
      label: EVENT_LABELS[eventType],
      detail: sanitizeEventDetail(detail ?? null),
      actor,
      occurredAt: occurredAt.toISOString(),
    });
  };

  push('INVOICED', invoice.createdAt);

  if (invoice.paidAt) {
    const provider =
      invoice.paymentProvider === 'STRIPE' ? 'Stripe' : 'Test payment';
    push('PAID', invoice.paidAt, `Paid via ${provider}.`);
  }

  if (invoice.lastReminderAt) {
    push('PAYMENT_REMINDER', invoice.lastReminderAt);
  }

  if (invoice.status === 'OVERDUE' || invoice.escalatedAt) {
    const overdueAt = invoice.dueAt;
    push('OVERDUE', overdueAt);
  }

  if (
    invoice.replacementStatus === 'SEARCHING' ||
    invoice.status === 'PENDING_REPLACEMENT'
  ) {
    push(
      'REPLACEMENT_SEARCHING',
      invoice.cancelledAt ?? invoice.createdAt,
      invoice.cancellationReason,
      cancellationActorToEventActor(invoice.cancelledBy ?? 'SYSTEM'),
    );
  }

  if (invoice.replacementStatus === 'FOUND') {
    push('REPLACEMENT_FOUND', invoice.paidAt ?? invoice.createdAt);
  }

  if (invoice.replacementStatus === 'NOT_FOUND') {
    push(
      'REPLACEMENT_NOT_FOUND',
      invoice.cancelledAt ?? invoice.createdAt,
      invoice.cancellationReason,
    );
  }

  if (invoice.status === 'REFUNDED') {
    push(
      'REFUNDED',
      invoice.cancelledAt ?? invoice.createdAt,
      invoice.stripeRefundId
        ? `Stripe refund ${invoice.stripeRefundId}`
        : invoice.cancellationReason,
    );
  }

  if (invoice.status === 'CANCELLED') {
    push(
      'CANCELLED',
      invoice.cancelledAt ?? invoice.createdAt,
      invoice.cancellationReason,
      cancellationActorToEventActor(invoice.cancelledBy ?? 'SYSTEM'),
    );
  }

  if (invoice.escalatedAt) {
    push('ESCALATED', invoice.escalatedAt);
  }

  if (
    invoice.status === 'PAID' &&
    invoice.cancellationReason &&
    invoice.cancelledAt
  ) {
    push('FEE_NON_REFUNDABLE', invoice.cancelledAt, invoice.cancellationReason);
  }

  items.sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  return items;
}

export function mergeMatchFeeEvents(
  persisted: MatchFeeInvoiceEvent[],
  invoice: Parameters<typeof synthesizeMatchFeeEvents>[0],
): MatchFeeInvoiceEventDto[] {
  if (persisted.length > 0) {
    return persisted.map(mapMatchFeeEventRow);
  }
  return synthesizeMatchFeeEvents(invoice);
}
