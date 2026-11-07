/**
 * About us page content.
 */
export type AboutStory = {
  title: string;
  paragraphs: string[];
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
    paragraphs: [
      'In the autumn of 2024, Becca and I moved from Doncaster, England, to Nova Scotia with our little daughter. I was looking forward to more ordinary days together. With a young child, even a Saturday with nothing planned can turn into a whole adventure.',
      'In Doncaster, I was a GP partner and trainer in a large, busy practice. I loved the work, but it was easy for a full day at the surgery to become a full evening, too. Moving to Nova Scotia made me think about what I wanted to make more time for. I wanted more days with Becca and our daughter, and a bit of time for myself, whether that meant taking a golf lesson or going mountain biking with friends. Getting outside and spending time with people I care about is part of how I look after my mental health. I come back to work with more energy for the job I love.',
      'When I started practising in Elmsdale, I was surprised by how hard it was to find a locum. Even planning a few days away meant first figuring out who would look after my patients. I wanted to be able to put a date on the calendar, look forward to it with my family, and know my patients would have someone to turn to while I was away.',
      'That’s why I started LocumLink. I wanted to make it easier for doctors to help each other out. A doctor who needs time away can post the dates they need covered, and a locum can pick up work that fits their schedule. Sometimes that’s all it takes for a colleague to get a few days away and come back feeling like themselves again. I know how much that can mean.',
    ],
    attributionName: 'Dr. Ifedolapo Fayanjuola',
    attributionRole: 'Founder, LocumLink',
    attributionLines: [
      'Family Physician, Elmsdale, Nova Scotia',
      'Assistant Professor, Dalhousie University',
      'Former GP Trainer and GP Partner, UK',
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
