/** Days after request before a single reminder is sent. */
export const PLACEMENT_FEEDBACK_REMINDER_DAYS = 3;

export const PLACEMENT_FEEDBACK_RATINGS = [
  'MET',
  'SOME',
  'SIGNIFICANT',
  'UNABLE',
] as const;

export const PLACEMENT_FEEDBACK_BOOK_AGAIN = ['YES', 'MAYBE', 'NO'] as const;

export const PLACEMENT_FEEDBACK_BASED_ON = ['DIRECT', 'STAFF', 'BOTH'] as const;

export type PlacementFeedbackRatingValue =
  (typeof PLACEMENT_FEEDBACK_RATINGS)[number];
export type PlacementFeedbackBookAgainValue =
  (typeof PLACEMENT_FEEDBACK_BOOK_AGAIN)[number];
export type PlacementFeedbackBasedOnValue =
  (typeof PLACEMENT_FEEDBACK_BASED_ON)[number];
