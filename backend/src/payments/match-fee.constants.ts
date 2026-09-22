export const MATCH_FEE_AMOUNT_CENTS = 25000;
export const MATCH_FEE_CURRENCY = 'CAD';
export const MATCH_FEE_DUE_DAYS = 7;
export const MATCH_FEE_CANCELLATION_WINDOW_DAYS = 14;
export const MATCH_FEE_ESCALATION_DAYS_AFTER_DUE = 30;

export const MATCH_FEE_POLICY = {
  locumFee: 'Free',
  hostPostingFee: 'Free to post',
  matchFeeAmountCad: 250,
  matchFeeDescription:
    'Pay $250 only when a locum is successfully confirmed and accepts the shift.',
  dueRule:
    'Payment is due within 7 days of the invoice or before the locum starts, whichever comes first.',
  clinicalPayNote:
    'MSI pays the locum directly for clinical work. LocumLink only collects its $250 matching fee.',
  futurePaymentMethods: 'Pay by card on this page when checkout is available.',
  cancellationRules: [
    {
      id: 'early_cancel',
      summary:
        'More than 14 days before start: either party may cancel. If the fee was paid, the host receives a refund or credit.',
    },
    {
      id: 'host_late_cancel',
      summary:
        'Host cancels within 14 days of start: the $250 fee is non-refundable if already paid.',
    },
    {
      id: 'locum_late_cancel',
      summary:
        'Locum cancels within 14 days of start: LocumLink will try to find a replacement. If none is found, the host receives a refund or credit.',
    },
    {
      id: 'overdue_escalation',
      summary:
        'Unpaid invoices become overdue after the due date. After 30 days overdue, the account is flagged for admin review.',
    },
    {
      id: 'emergency',
      summary:
        'Emergencies: LocumLink may use reasonable discretion on refunds and account actions.',
    },
  ],
} as const;
