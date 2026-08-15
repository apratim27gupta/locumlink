export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] };

export type ResourceGuide = {
  id: string;
  title: string;
  tagline?: string;
  description: string;
  blocks: GuideBlock[];
};

/** Keep Resources lists A–Z by title when adding items. */
export function sortResourcesByTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }),
  );
}

export const LOCUM_PHYSICIAN_GUIDE: ResourceGuide = {
  id: 'locum-physician-guide',
  title: 'LocumLink Locum Physician Guide',
  tagline: 'Register. Browse. Apply. Connect.',
  description:
    'A step-by-step guide to registering, browsing opportunities, applying, and connecting with hosts.',
  blocks: [
    {
      type: 'p',
      text: 'LocumLink makes it easy for physicians to discover and apply for locum opportunities across Nova Scotia.',
    },
    { type: 'h', text: 'Step 1 – Register & Get Verified' },
    {
      type: 'p',
      text: 'Visit LocumLink.ca or download the LocumLink Canada app on iOS.',
    },
    {
      type: 'p',
      text: 'Register as a Locum Physician using your CPSNS number.',
    },
    {
      type: 'p',
      text: 'Once your physician status has been verified by the LocumLink team, you can browse and apply for opportunities.',
    },
    {
      type: 'p',
      text: 'Verified locums receive instant email notifications whenever a new locum opportunity is posted, helping you hear about new opportunities early.',
    },
    { type: 'h', text: 'Step 2 – Complete Your Profile' },
    {
      type: 'p',
      text: 'Complete your professional profile so hosts have the information they need when reviewing your application.',
    },
    {
      type: 'p',
      text: 'Include your basic information, years of experience, professional summary, specialty, location, CV/resume and relevant professional documents.',
    },
    {
      type: 'p',
      text: 'A complete and up-to-date profile helps you make a strong first impression.',
    },
    { type: 'h', text: 'Step 3 – Browse Opportunities' },
    {
      type: 'p',
      text: 'Select Browse Opportunities from the main menu to see available locum positions.',
    },
    {
      type: 'p',
      text: 'You can quickly review key information including location, dates and type of opportunity before selecting a posting for further details.',
    },
    { type: 'h', text: 'Step 4 – Review the Opportunity' },
    {
      type: 'p',
      text: 'Open an opportunity to review the full details, including:',
    },
    {
      type: 'ul',
      items: [
        'Dates and location',
        'Practice information',
        'Responsibilities',
        'Required credentials',
        'Schedule and other relevant details',
      ],
    },
    {
      type: 'p',
      text: 'Make sure the opportunity fits your availability and preferences before applying.',
    },
    { type: 'h', text: 'Step 5 – Apply' },
    {
      type: 'p',
      text: 'Found an opportunity that works for you?',
    },
    {
      type: 'p',
      text: 'Select Apply to send your application directly to the host physician.',
    },
    {
      type: 'p',
      text: 'You can view and track your applications under My Applications.',
    },
    { type: 'h', text: 'Step 6 – Get Shortlisted & Connect' },
    {
      type: 'p',
      text: "If you are shortlisted, you can communicate directly with the host through LocumLink's messaging system.",
    },
    {
      type: 'p',
      text: 'This gives you an opportunity to discuss availability, working arrangements, expectations and other details before confirming the locum.',
    },
    { type: 'h', text: 'Step 7 – Never Miss a New Opportunity' },
    {
      type: 'p',
      text: 'Once verified, you will receive instant email notifications whenever new locum opportunities are posted.',
    },
    {
      type: 'p',
      text: 'Simply log in to LocumLink to review the opportunity and apply if it suits you.',
    },
    {
      type: 'p',
      text: 'Applying early can increase your chances of securing opportunities that fit your schedule.',
    },
    { type: 'h', text: 'Need Help?' },
    {
      type: 'p',
      text: 'The LocumLink team is here to help with registration, verification, profiles, applications or using the platform.',
    },
  ],
};

export const HOST_PHYSICIAN_GUIDE: ResourceGuide = {
  id: 'host-physician-guide',
  title: 'LocumLink Host Physician Guide',
  tagline: 'Creating an Effective Locum Opportunity',
  description:
    'How to write a clear locum posting that attracts applications and helps you find the right physician.',
  blocks: [
    {
      type: 'p',
      text: 'A clear, well-written posting helps attract more applications and increases your chances of finding the right locum.',
    },
    { type: 'h', text: '1. Choose a Clear Job Title' },
    {
      type: 'p',
      text: 'Select a title that quickly tells physicians what the opportunity involves.',
    },
    { type: 'p', text: 'Examples:' },
    {
      type: 'ul',
      items: [
        'Family Physician – Family Practice',
        'Family Physician – Long-Term Care',
        'Family Physician – Collaborative Practice',
      ],
    },
    { type: 'h', text: '2. Write a Meaningful Description' },
    {
      type: 'p',
      text: 'In 3–6 concise sentences, describe:',
    },
    {
      type: 'ul',
      items: [
        'Type of practice',
        'Team supports available',
        'EMR used',
        'Typical patient population',
        'Schedule flexibility',
        'What makes the opportunity attractive',
      ],
    },
    { type: 'h', text: '3. Select Relevant Responsibilities' },
    {
      type: 'p',
      text: 'Choose all that apply, for example:',
    },
    {
      type: 'ul',
      items: [
        'Scheduled Patients',
        'Chronic Disease Management',
        'Review Laboratory & Imaging Results',
        'Prescription Renewals',
        'Long-Term Care Rounds',
        'Telephone/Virtual Consultations',
      ],
    },
    { type: 'h', text: '4. Complete Schedule & Compensation' },
    { type: 'p', text: 'Include:' },
    {
      type: 'ul',
      items: [
        'Start and end dates',
        'Working hours',
        'Compensation or payment model',
      ],
    },
    {
      type: 'p',
      text: 'Mention if the dates or schedule are flexible.',
    },
    { type: 'h', text: '5. State Essential Requirements' },
    {
      type: 'p',
      text: 'Include only requirements that are genuinely necessary, such as:',
    },
    {
      type: 'ul',
      items: [
        'CPSNS Licence',
        'CMPA Coverage',
        'Long-Term Care Experience',
        'Rural Practice Experience',
      ],
    },
    { type: 'h', text: '6. Highlight What Makes Your Opportunity Attractive' },
    { type: 'p', text: 'Examples include:' },
    {
      type: 'ul',
      items: [
        'Supportive team',
        'Experienced nursing staff',
        'Collaborative practice',
        'Flexible schedule',
        'Accommodation support',
        'Beautiful community',
        'Opportunity for ongoing work',
      ],
    },
    { type: 'h', text: '7. Review Before Publishing' },
    { type: 'p', text: 'Ask yourself:' },
    {
      type: 'p',
      text: '"Would I apply for this opportunity if I knew nothing about this practice?"',
    },
    { type: 'h', text: '8. Post Early' },
    {
      type: 'p',
      text: 'Posting several weeks in advance:',
    },
    {
      type: 'ul',
      items: [
        'Gives verified physicians more time to discover your opportunity.',
        'Allows time for applications and discussions.',
        'Increases the likelihood of receiving multiple applications.',
        'Improves your chances of securing the right locum.',
      ],
    },
    { type: 'h', text: 'Need Help?' },
    {
      type: 'p',
      text: 'The LocumLink team is happy to assist with creating your posting or finding the right locum physician.',
    },
  ],
};
