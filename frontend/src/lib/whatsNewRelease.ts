import { MATCH_FEE_FULL_CAD, MATCH_FEE_HALF_CAD, HALF_SLOT_HOURS } from '@/lib/jobSchedule';
import { howToVideoHref } from '@/lib/howToVideos';

export type WhatsNewFeature = {
  num: string;
  user: 'Host' | 'Locum';
  feature: string;
  whatUsersCanDo: string;
  /** One or more How it works demo ids (Flexible dates links to all three date demos). */
  howToVideoIds: readonly string[];
};

export const WHATS_NEW_RELEASE = {
  dateLabel: 'Friday, November 6, 2026',
  bulletinLabel: 'Release bulletin',
  sectionLabel: "What's changing",
  eyebrow: 'Friday, November 6, 2026 | Release bulletin',
  headline: 'More flexibility. Better locum coverage.',
  tagline: 'CONNECT. COVER. CARE.',
  intro:
    "Here's what's new for hosts and locums: half-day blocks, partial coverage, a pre-filled MSI GP Locum Application, and transparent match fees.",
  highlights: [
    { label: 'Flexible', detail: `${HALF_SLOT_HOURS}-hour half-days` },
    { label: 'Partial coverage', detail: 'Multiple locums' },
    { label: 'Less paperwork', detail: 'MSI GP Locum Application' },
    { label: 'Free for locums', detail: 'No locum fees' },
  ],
  features: [
    {
      num: '01',
      user: 'Host',
      feature: 'Flexible dates',
      whatUsersCanDo: 'Pick the exact days you need covered',
      // Single Watch demo → Flexible dates I (also covers the three date modes entry point)
      howToVideoIds: ['post-continuous-days-slots'],
    },
    {
      num: '02',
      user: 'Host',
      feature: 'Full / half-day slots',
      whatUsersCanDo: `Post ${HALF_SLOT_HOURS}-hour half-days or full days`,
      howToVideoIds: ['post-continuous-days-slots'],
    },
    {
      num: '03',
      user: 'Host',
      feature: 'Multiple locums',
      whatUsersCanDo: 'Fill one posting with more than one locum',
      howToVideoIds: ['book-multiple-locums'],
    },
    {
      num: '04',
      user: 'Host',
      feature: 'Coverage visibility',
      whatUsersCanDo: 'See which days and slots are still open',
      howToVideoIds: ['book-multiple-locums'],
    },
    {
      num: '05',
      user: 'Host',
      feature: 'Cancel a match',
      whatUsersCanDo: 'Cancel when plans change',
      howToVideoIds: ['cancel-match'],
    },
    {
      num: '06',
      user: 'Host',
      feature: 'Match fee payment',
      whatUsersCanDo: 'Pay per confirmed match',
      howToVideoIds: ['pay-match-fees'],
    },
    {
      num: '07',
      user: 'Host',
      feature: 'MSI GP Locum Application',
      whatUsersCanDo: 'Review, save and download the pre-filled application.',
      howToVideoIds: ['pre-filled-gp-form'],
    },
    {
      num: '08',
      user: 'Locum',
      feature: 'Flexible applications',
      whatUsersCanDo: 'Apply to the days and slots that work for you',
      howToVideoIds: ['locum-flexible-applications'],
    },
    {
      num: '09',
      user: 'Locum',
      feature: 'Modify availability',
      whatUsersCanDo: 'Update your availability as it changes',
      howToVideoIds: ['locum-modify-availability'],
    },
    {
      num: '10',
      user: 'Locum',
      feature: 'Partial postings',
      whatUsersCanDo: 'Apply to remaining open coverage',
      howToVideoIds: ['apply-remaining-blocks'],
    },
    {
      num: '11',
      user: 'Locum',
      feature: 'Withdraw application',
      whatUsersCanDo: 'Withdraw before you are matched',
      howToVideoIds: ['locum-withdraw-application'],
    },
  ] satisfies WhatsNewFeature[],
  fees: {
    title: 'Simple, transparent match fees',
    body: `LocumLink is free for locum physicians. Hosts pay $${MATCH_FEE_HALF_CAD} for one half-day or $${MATCH_FEE_FULL_CAD} for more than one half-day per confirmed match. A half-day is ${HALF_SLOT_HOURS} hours, in line with the GP Locum Programme guide. Two half-day blocks make a full day.`,
    exampleLabel: 'Match example:',
    example:
      'Each confirmed locum on a posting counts as a separate match. If the same locum covers Monday morning and Wednesday afternoon on one posting, that\'s one $' +
      MATCH_FEE_FULL_CAD +
      ' match. If two different locums cover those blocks, that\'s two $' +
      MATCH_FEE_HALF_CAD +
      ' matches.',
    halfDayCad: MATCH_FEE_HALF_CAD,
    moreThanHalfCad: MATCH_FEE_FULL_CAD,
    halfHours: HALF_SLOT_HOURS,
    moreDetailsLabel: 'View more details in FAQs',
    moreDetailsHref: '/faq#host-match-fee',
  },
  thanks: 'Thank you to the hosts and locums helping us improve LocumLink.',
  founder: 'Dr. Ifedolapo Fayanjuola, Founder',
  cta: {
    title: 'Find coverage. Find opportunity.',
    body: 'Hosts: post the coverage you need. Locums: apply for shifts that fit.',
    urlLabel: 'locumlink.ca',
    url: 'https://locumlink.ca',
  },
} as const;

export function featureHowToHrefs(feature: WhatsNewFeature): string[] {
  return feature.howToVideoIds.map((id) => howToVideoHref(id));
}

/** @deprecated Prefer featureHowToHrefs — Flexible dates has multiple demos. */
export function featureHowToHref(feature: WhatsNewFeature): string | null {
  const hrefs = featureHowToHrefs(feature);
  return hrefs[0] ?? null;
}
