import { WHATS_NEW_RELEASE } from '@/lib/whatsNewRelease';

export type NewsUpdateItem = {
  id: string;
  /** ISO date for sorting / deep links */
  date: string;
  dateLabel: string;
  title: string;
  /** Optional one-line summary shown under the headline in a smaller font */
  summary?: string;
  /** Opens What's New modal when true */
  opensWhatsNewModal?: boolean;
};

/** Public News & updates list. Add future bulletins here. */
export const NEWS_UPDATES: NewsUpdateItem[] = [
  {
    id: 'release-2026-11-06',
    date: '2026-11-06',
    dateLabel: WHATS_NEW_RELEASE.dateLabel,
    title: 'Feature release - more flexibility, better locum coverage',
    summary:
      'Introducing flexible bookings, partial shift coverage, simplified paperwork and transparent match fees.',
    opensWhatsNewModal: true,
  },
];

export const NEWS_PAGE_PATH = '/news';
