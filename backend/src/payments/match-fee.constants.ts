export const HALF_SLOT_HOURS = 3.5;
export const FULL_SLOT_HOURS = 7;
export const MAX_HOURS_PER_DAY = 7;

/** Match fee: <= half-day total claimed hours. */
export const MATCH_FEE_HALF_CENTS = 12500;
/** Match fee: more than half-day total claimed hours (2 halves, 1 full, or multi-day). */
export const MATCH_FEE_FULL_CENTS = 25000;
/** @deprecated Prefer MATCH_FEE_FULL_CENTS / computeMatchFeeAmountCents. */
export const MATCH_FEE_AMOUNT_CENTS = MATCH_FEE_FULL_CENTS;

export const MATCH_FEE_CURRENCY = 'CAD';
export const MATCH_FEE_DUE_DAYS = 7;
export const MATCH_FEE_CANCELLATION_WINDOW_DAYS = 14;
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

/** $125 if total claimed hours <= 3.5, else $250. */
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
  matchFeeHalfCad: 125,
  matchFeeFullCad: 250,
  matchFeeAmountCad: 250,
  /** Discrete bullets shown under "Match fee". */
  matchFeePoints: [
    'When a locum confirms a match on your posting, LocumLink invoices a platform match fee per locum.',
    '$125 CAD when the locum claims up to 3.5 hours total.',
    '$250 CAD when the locum claims more than 3.5 hours total.',
  ],
  /** @deprecated Prefer matchFeePoints; kept for older clients. */
  matchFeeDescription:
    'When a locum confirms a match on your posting, a platform match fee is invoiced per locum: $125 CAD for up to 3.5 hours total claimed, or $250 CAD when the locum claims more than 3.5 hours.',
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
        'More than 14 days before start - either party may cancel. If the fee was paid, the host receives a refund to the original payment method.',
    },
    {
      id: 'host_late_cancel',
      summary:
        'Host cancels within 14 days of start - the match fee is non-refundable.',
    },
    {
      id: 'locum_late_cancel',
      summary:
        'Locum cancels within 14 days of start - LocumLink will try to find a replacement. If none is found, the host receives a refund to the original payment method.',
    },
    {
      id: 'locum_late_cancel_replacement_fee',
      summary:
        'When a replacement locum accepts, the original paid match fee stands - no second invoice.',
    },
    {
      id: 'post_completion_tickets',
      summary:
        'Match fees stay as invoiced, during the placement. After the last shift on that invoice, you can raise a ticket about any concerns and LocumLink will follow up.',
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
