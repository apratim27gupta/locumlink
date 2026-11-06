/**
 * How it works / tutorial demos — titles align with the release bulletin features.
 *
 * GCS bucket: how-to-videos-l2 (public objectViewer)
 * Folder:     How to- LocumLink/
 *
 * Default: direct public HTTPS URLs (browser-cache friendly).
 * Override with NEXT_PUBLIC_HOW_TO_VIDEOS_BASE_URL if the prefix changes.
 * Fallback: /api/how-to-videos/{id} signed URLs if public access is removed.
 */
export type HowToVideo = {
  id: string;
  /** Exact object basename in GCS (without .mp4) */
  fileBase: string;
  title: string;
  description: string;
  audience: 'Host' | 'Locum' | 'Both';
  durationHint?: string;
  providerSrc?: string | null;
  embedUrl?: string | null;
};

/** Public GCS HTTPS prefix (spaces in folder encoded). */
export const DEFAULT_HOW_TO_VIDEOS_BASE_URL =
  'https://storage.googleapis.com/how-to-videos-l2/How%20to-%20LocumLink';

export function howToVideosBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_HOW_TO_VIDEOS_BASE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, '');
  return DEFAULT_HOW_TO_VIDEOS_BASE_URL;
}

/** Direct public GCS URL (or providerSrc / signed API fallback). */
export function howToVideoSrc(video: HowToVideo): string {
  if (video.providerSrc) return video.providerSrc;
  return `${howToVideosBaseUrl()}/${encodeURIComponent(video.fileBase)}.mp4`;
}

export function howToVideoUploadHint(video: HowToVideo): string {
  return `gs://how-to-videos-l2/How to- LocumLink/${video.fileBase}.mp4`;
}

export const HOW_TO_VIDEOS: HowToVideo[] = [
  {
    id: 'post-continuous-days-slots',
    fileBase: 'Post_for_continuous_days-full-day_or_half-day_slots',
    title: 'Flexible dates I',
    description:
      'Continuous dates: one stretch of days from a start to an end date. Also covers how to add full-day and half-day slots.',
    audience: 'Host',
    durationHint: 'Demo 01',
  },
  {
    id: 'post-for-specific-dates',
    fileBase: 'Post_for_specific_dates',
    title: 'Flexible dates II',
    description:
      'Specific days: pick each day you need a locum. They do not have to be consecutive.',
    audience: 'Host',
    durationHint: 'Demo 02',
  },
  {
    id: 'post-for-multiple-periods',
    fileBase: 'Post_for_multiple_periods',
    title: 'Flexible dates III',
    description:
      'Multiple periods: add one or more date periods, each with its own start, end, and time.',
    audience: 'Host',
    durationHint: 'Demo 03',
  },
  {
    id: 'book-multiple-locums',
    fileBase: 'Book_multiple_locums_for_one_posting+coverage_visibility',
    title: 'Multiple locums & coverage visibility',
    description:
      'Fill one posting with more than one locum and see which days and slots remain open.',
    audience: 'Host',
    durationHint: 'Demo 04',
  },
  {
    id: 'cancel-match',
    fileBase: 'cancel_match',
    title: 'Cancel a match',
    description: 'Cancel a confirmed match when plans change.',
    audience: 'Host',
    durationHint: 'Demo 05',
  },
  {
    id: 'pay-match-fees',
    fileBase: 'pay_match_fees',
    title: 'Match fee payment',
    description: 'How host match fee payment works after a confirmed match.',
    audience: 'Host',
    durationHint: 'Demo 06',
  },
  {
    id: 'pre-filled-gp-form',
    fileBase: 'pre-filled_GP_Form',
    title: 'MSI GP Locum Application',
    description:
      'Review, save and download the pre-filled MSI GP Locum Application after a locum accepts.',
    audience: 'Host',
    durationHint: 'Demo 07',
  },
  {
    id: 'locum-flexible-applications',
    fileBase: 'Locum_flexible_applications',
    title: 'Flexible applications',
    description: 'Apply to the days and slots that work for you on a posting.',
    audience: 'Locum',
    durationHint: 'Demo 01',
  },
  {
    id: 'locum-modify-availability',
    fileBase: 'Locum_Modify_availability',
    title: 'Modify availability',
    description: 'Update your availability as it changes.',
    audience: 'Locum',
    durationHint: 'Demo 02',
  },
  {
    id: 'apply-remaining-blocks',
    fileBase: 'Apply_for_remaining_available_blocks',
    title: 'Partial postings',
    description: 'Apply to open coverage left on a partially filled posting.',
    audience: 'Locum',
    durationHint: 'Demo 03',
  },
  {
    id: 'locum-withdraw-application',
    fileBase: 'Locum_withdraw_application',
    title: 'Withdraw application',
    description: 'Withdraw an application before you are matched.',
    audience: 'Locum',
    durationHint: 'Demo 04',
  },
];

export const HOW_IT_WORKS_PAGE_HREF = '/how-it-works';
/** @deprecated Prefer HOW_IT_WORKS_PAGE_HREF - /how-to redirects there. */
export const HOW_TO_PAGE_HREF = HOW_IT_WORKS_PAGE_HREF;

export function howToVideoHref(id: string): string {
  return `${HOW_IT_WORKS_PAGE_HREF}#${id}`;
}

export function getHowToVideo(id: string): HowToVideo | undefined {
  return HOW_TO_VIDEOS.find((v) => v.id === id);
}
