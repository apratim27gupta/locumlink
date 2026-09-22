import {
  computeDueAt,
  daysUntilCalendarDate,
  evaluateCancellationPolicy,
  isEscalationDue,
} from './match-fee-cancellation.util';

describe('match-fee-cancellation.util', () => {
  it('computes due date as the earlier of seven days or shift start', () => {
    const created = new Date('2026-01-01T12:00:00.000Z');
    const due = computeDueAt(created, '2026-01-05');
    expect(due.toISOString()).toBe('2026-01-05T23:59:59.999Z');
  });

  it('uses seven-day window when shift is far out', () => {
    const created = new Date('2026-01-01T12:00:00.000Z');
    const due = computeDueAt(created, '2026-03-01');
    expect(due.toISOString()).toBe('2026-01-08T12:00:00.000Z');
  });

  it('counts days until a calendar date', () => {
    const now = new Date('2026-06-01T15:00:00.000Z');
    expect(daysUntilCalendarDate('2026-06-20', now)).toBe(19);
    expect(daysUntilCalendarDate('2026-05-20', now)).toBe(-12);
  });

  it('host late cancel keeps paid fee non-refundable', () => {
    const result = evaluateCancellationPolicy({
      cancelledBy: 'HOST',
      wasPaid: true,
      daysUntilStart: 10,
    });
    expect(result.invoiceStatus).toBe('UNCHANGED');
    expect(result.nonRefundable).toBe(true);
  });

  it('host early cancel refunds paid fee', () => {
    const result = evaluateCancellationPolicy({
      cancelledBy: 'HOST',
      wasPaid: true,
      daysUntilStart: 20,
    });
    expect(result.invoiceStatus).toBe('REFUNDED');
    expect(result.refundResolution).toBe('REFUND');
  });

  it('locum late cancel moves paid invoice to replacement pending', () => {
    const result = evaluateCancellationPolicy({
      cancelledBy: 'LOCUM',
      wasPaid: true,
      daysUntilStart: 5,
    });
    expect(result.invoiceStatus).toBe('PENDING_REPLACEMENT');
    expect(result.replacementStatus).toBe('SEARCHING');
  });

  it('host early cancel boundary is more than 14 days', () => {
    const late = evaluateCancellationPolicy({
      cancelledBy: 'HOST',
      wasPaid: true,
      daysUntilStart: 14,
    });
    expect(late.nonRefundable).toBe(true);
    const early = evaluateCancellationPolicy({
      cancelledBy: 'HOST',
      wasPaid: true,
      daysUntilStart: 15,
    });
    expect(early.refundResolution).toBe('REFUND');
  });

  it('detects escalation threshold thirty days after due date', () => {
    const dueAt = new Date('2026-01-01T00:00:00.000Z');
    expect(isEscalationDue(dueAt, null, new Date('2026-01-30T00:00:00.000Z'))).toBe(
      false,
    );
    expect(isEscalationDue(dueAt, null, new Date('2026-02-01T00:00:00.000Z'))).toBe(
      true,
    );
    expect(
      isEscalationDue(dueAt, new Date('2026-02-01T00:00:00.000Z'), new Date('2026-03-01T00:00:00.000Z')),
    ).toBe(false);
  });
});
