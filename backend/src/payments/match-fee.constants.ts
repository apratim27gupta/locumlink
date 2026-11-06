export const HALF_SLOT_HOURS = 3.75;
export const FULL_SLOT_HOURS = 7.5;
export const MAX_HOURS_PER_DAY = 7.5;
/** Half-day custom end may be at most 7h29m; 7.5h+ must use full-day. */
export const MAX_HALF_SLOT_MINUTES = 7 * 60 + 29;
export const MAX_HALF_SLOT_HOURS = MAX_HALF_SLOT_MINUTES / 60;

/** Match fee: <= half-day total claimed hours (CA$125). */
export const MATCH_FEE_HALF_CENTS = 12_500;
/** Match fee: more than half-day total claimed hours (CA$250). */
export const MATCH_FEE_FULL_CENTS = 25_000;
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

/** CA$125 if total claimed hours <= 3.75, else CA$250. */
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

/** Same as charged amounts; kept for policy / FAQ copy helpers. */
export const MATCH_FEE_HALF_DISPLAY_CAD = MATCH_FEE_HALF_CENTS / 100;
export const MATCH_FEE_FULL_DISPLAY_CAD = MATCH_FEE_FULL_CENTS / 100;

export const MATCH_FEE_POLICY = {
  locumFee: 'Free',
  hostPostingFee: 'Free to post',
  matchFeeHalfCad: MATCH_FEE_HALF_DISPLAY_CAD,
  matchFeeFullCad: MATCH_FEE_FULL_DISPLAY_CAD,
  matchFeeAmountCad: MATCH_FEE_FULL_DISPLAY_CAD,
  /** Discrete bullets shown under "Match fee". */
  matchFeePoints: [
    'When a locum confirms a match on your posting, LocumLink invoices a platform match fee per locum.',
    `CA$${MATCH_FEE_HALF_DISPLAY_CAD} when the locum claims up to ${HALF_SLOT_HOURS} hours total.`,
    `CA$${MATCH_FEE_FULL_DISPLAY_CAD} when the locum claims more than ${HALF_SLOT_HOURS} hours total.`,
    '14% HST is added to each match fee invoice.',
    `If the locum increases availability from 1 half-day slot to more after the CA$${MATCH_FEE_HALF_DISPLAY_CAD} invoice was created, an additional CA$${MATCH_FEE_HALF_DISPLAY_CAD} invoice will be created after the shifts are completed.`,
  ],
  /** @deprecated Prefer matchFeePoints; kept for older clients. */
  matchFeeDescription:
    `When a locum confirms a match on your posting, a platform match fee is invoiced per locum: CA$${MATCH_FEE_HALF_DISPLAY_CAD} for up to ${HALF_SLOT_HOURS} hours total claimed, or CA$${MATCH_FEE_FULL_DISPLAY_CAD} when the locum claims more than ${HALF_SLOT_HOURS} hours. 14% HST is added to each invoice.`,
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
        '14 days or more before start - either party may cancel (hosts only until the first matched shift day). Paid invoices are refunded by admin after review; unpaid invoices are cancelled.',
    },
    {
      id: 'host_late_cancel',
      summary:
        'Host may cancel after accept until the first matched shift day. Fewer than 14 days before start - paid fee is non-refundable; unpaid invoice stays due. After the first shift day has passed, host cancel is unavailable.',
    },
    {
      id: 'locum_late_cancel',
      summary:
        'Locum cancels fewer than 14 days before start - LocumLink seeks a replacement. If none is found, paid invoices are refunded by admin and unpaid invoices are cancelled. If a replacement accepts, the original invoice stands (no second fee).',
    },
    {
      id: 'locum_late_cancel_replacement_fee',
      summary:
        'When a replacement locum accepts, the original paid match fee stands - no second invoice.',
    },
    {
      id: 'post_completion_tier_top_up',
      summary:
        `If the locum increases availability from 1 half-day slot to more after the CA$${MATCH_FEE_HALF_DISPLAY_CAD} invoice was created, an additional CA$${MATCH_FEE_HALF_DISPLAY_CAD} invoice will be created after the shifts are completed. That top-up follows the same payment and cancellation rules as the original match fee.`,
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
