export const HALF_SLOT_HOURS = 3.5;
export const FULL_SLOT_HOURS = 7;
export const MAX_HOURS_PER_DAY = 7;
/** Half-day custom end may be at most 6h59m; 7h+ must use full-day. */
export const MAX_HALF_SLOT_MINUTES = 6 * 60 + 59;
export const MAX_HALF_SLOT_HOURS = MAX_HALF_SLOT_MINUTES / 60;

/** Match fee: <= half-day total claimed hours. TEMP staging live QA: $5 (was $125). */
export const MATCH_FEE_HALF_CENTS = 500;
/** Match fee: more than half-day total claimed hours. TEMP staging live QA: $10 (was $250). */
export const MATCH_FEE_FULL_CENTS = 1000;
/** @deprecated Prefer MATCH_FEE_FULL_CENTS / computeMatchFeeAmountCents. */
export const MATCH_FEE_AMOUNT_CENTS = MATCH_FEE_FULL_CENTS;

export const MATCH_FEE_CURRENCY = 'CAD';
/** HST charged on top of the match fee, in basis points (1400 = 14%). Snapshotted per invoice. */
export const MATCH_FEE_HST_RATE_BPS = 1400;

export function computeMatchFeeTaxCents(amountCents: number, taxRateBps: number): number {
  return Math.round((amountCents * taxRateBps) / 10_000);
}

/** What the host pays: match fee plus the HST snapshotted on the invoice. */
export function matchFeeTotalCents(invoice: { amountCents: number; taxCents: number }): number {
  return invoice.amountCents + invoice.taxCents;
}

export function formatTaxRate(taxRateBps: number): string {
  const pct = taxRateBps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2)}%`;
}
export const MATCH_FEE_DUE_DAYS = 7;
export const MATCH_FEE_CANCELLATION_WINDOW_DAYS = 14;
/** Min days between automated overdue payment reminders (email + in-app). */
export const MATCH_FEE_OVERDUE_REMINDER_INTERVAL_DAYS = 7;
export const MATCH_FEE_ESCALATION_DAYS_AFTER_DUE = 30;

export type MatchFeeTier = 'HALF' | 'FULL';

/**
 * Postings created (platform calendar day) before MATCH_FEE_START_DATE
 * (YYYY-MM-DD) are grandfathered and never invoiced. Unset or invalid means
 * every posting is invoiced.
 */
export function isPostingGrandfatheredFromMatchFee(
  postingCreatedDay: string,
  startDate: string | undefined = process.env.MATCH_FEE_START_DATE,
): boolean {
  const start = startDate?.trim();
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  return postingCreatedDay < start;
}

/** $5 if total claimed hours <= 3.5, else $10 (TEMP staging live QA amounts). */
export function computeMatchFeeAmountCents(totalHours: number): number {
  if (!Number.isFinite(totalHours) || totalHours <= HALF_SLOT_HOURS) {
    return MATCH_FEE_HALF_CENTS;
  }
  return MATCH_FEE_FULL_CENTS;
}

export function matchFeeTierFromHours(totalHours: number): MatchFeeTier {
  return computeMatchFeeAmountCents(totalHours) === MATCH_FEE_HALF_CENTS
    ? 'HALF'
    : 'FULL';
}

export const MATCH_FEE_POLICY = {
  locumFee: 'Free',
  hostPostingFee: 'Free to post',
  matchFeeHalfCad: 5,
  matchFeeFullCad: 10,
  matchFeeAmountCad: 10,
  /** Discrete bullets shown under "Match fee". */
  matchFeePoints: [
    'When a locum confirms a match on your posting, LocumLink invoices a platform match fee per locum.',
    `$${MATCH_FEE_HALF_CENTS / 100} when the locum claims up to 3.5 hours total.`,
    `$${MATCH_FEE_FULL_CENTS / 100} when the locum claims more than 3.5 hours total.`,
    '14% HST is added to each match fee invoice.',
    `If the locum increases availability from 1 half-day slot to more after the $${MATCH_FEE_HALF_CENTS / 100} invoice was created, an additional $${MATCH_FEE_HALF_CENTS / 100} invoice will be created after the shifts are completed.`,
  ],
  /** @deprecated Prefer matchFeePoints; kept for older clients. */
  matchFeeDescription:
    `When a locum confirms a match on your posting, a platform match fee is invoiced per locum: $${MATCH_FEE_HALF_CENTS / 100} for up to 3.5 hours total claimed, or $${MATCH_FEE_FULL_CENTS / 100} when the locum claims more than 3.5 hours. 14% HST is added to each invoice.`,
  perLocumFeeRule:
    'Each matched locum generates a separate invoice. Another locum on the same posting means another match fee at the same rates.',
  dueRule:
    'Payment is due within 7 days of the invoice or before the locum starts, whichever comes first.',
  clinicalPayNote:
    "MSI pays the locum directly for clinical work. LocumLink's match fee is separate platform matching only.",
  cancellationRules: [
    {
      id: 'early_cancel',
      summary:
        '14 days or more before start - either party may cancel. If the fee was paid, LocumLink reviews the cancellation and refunds the fee and HST to the original payment method.',
    },
    {
      id: 'host_late_cancel',
      summary:
        'Host cancels fewer than 14 days before start - the match fee is non-refundable.',
    },
    {
      id: 'locum_late_cancel',
      summary:
        'Locum cancels fewer than 14 days before start - LocumLink will try to find a replacement. If none is found, LocumLink refunds the fee and HST to the original payment method.',
    },
    {
      id: 'locum_late_cancel_replacement_fee',
      summary:
        'When a replacement locum accepts, the original paid match fee stands - no second invoice.',
    },
    {
      id: 'post_completion_tier_top_up',
      summary:
        `If the locum increases availability from 1 half-day slot to more after the $${MATCH_FEE_HALF_CENTS / 100} invoice was created, an additional $${MATCH_FEE_HALF_CENTS / 100} invoice will be created after the shifts are completed. That top-up follows the same payment and cancellation rules as the original match fee.`,
    },
    {
      id: 'post_completion_tickets',
      summary:
        'Match fees stay as invoiced during the placement. After the last shift on that invoice, you can raise a ticket about any concerns and LocumLink will follow up.',
    },
    {
      id: 'overdue_escalation',
      summary:
        'Unpaid invoices become overdue after the due date. After 30 days overdue, the account is flagged for admin review.',
    },
    {
      id: 'emergency',
      summary:
        'Emergencies - LocumLink may use reasonable discretion on refunds and account actions.',
    },
  ],
} as const;
