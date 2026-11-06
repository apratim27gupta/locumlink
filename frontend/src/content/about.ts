/**
 * About us page content.
 */
export type AboutStory = {
  title: string;
  body: string;
  attributionName: string;
  attributionRole: string;
  attributionLines: string[];
  imageSrc: string;
  imageAlt: string;
};

export const ABOUT_PAGE = {
  metaTitle: 'About us | LocumLink',
  metaDescription:
    'LocumLink was started by Dr. Ifedolapo Fayanjuola to make locum coverage easier for Nova Scotia physicians.',
  story: {
    title: 'Why I started LocumLink',
    body: 'When I began practising family medicine in Nova Scotia, I found it difficult to arrange locum coverage when I needed time away. I started LocumLink to make it easier for physicians to find coverage and for locums to pick up shifts that fit their schedules.',
    attributionName: 'Dr. Ifedolapo Fayanjuola',
    attributionRole: 'Founder, LocumLink',
    attributionLines: [
      'Family Physician, Elmsdale Medical Clinic',
      'Associate Professor, Dalhousie University',
      'Former GP trainer (UK)',
    ],
    imageSrc: '/about/dr-ife.jpeg',
    imageAlt: 'Dr. Ifedolapo Fayanjuola, founder of LocumLink',
  } satisfies AboutStory,
  cta: {
    title: 'Request a demo',
    body: 'Clinics and partners can book a short walkthrough of LocumLink.',
    primaryLabel: 'Request a demo',
  },
} as const;

export const ABOUT_PAGE_PATH = '/about';
