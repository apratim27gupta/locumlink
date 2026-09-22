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
        'Host cancels within 14 days of start - the match fee is non-refundable if already paid.',
    },
    {
      id: 'locum_late_cancel',
      summary:
        'Locum cancels within 14 days of start - LocumLink will try to find a replacement. If none is found, the host receives a refund to the original payment method.',
    },
    {
      id: 'locum_late_cancel_replacement_fee',
      summary:
        'A replacement locum who accepts generates a new match fee invoice.',
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
