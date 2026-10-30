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

/** Opens the in-app guide from dashboard “What happens next?” guidance. */
export const HOST_PHYSICIAN_GUIDE_HREF = '/host/resources?guide=1';
export const LOCUM_PHYSICIAN_GUIDE_HREF = '/locum/resources?guide=1';

/** Keep Resources lists A–Z by title when adding items. */
export function sortResourcesByTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }),
  );
}

export const LOCUM_PHYSICIAN_GUIDE: ResourceGuide = {
  id: 'locum-physician-guide',
  title: 'LocumLink Locum Physician Guide',
  tagline: 'Register. Browse. Apply. Connect. Get Matched.',
  description:
    'Register, apply, accept a placement, and see how the host submits the GP Locum Application to MSI.',
  blocks: [
    {
      type: 'p',
      text: 'LocumLink makes it easy for verified physicians to find and apply for locum opportunities across Nova Scotia.',
    },
    { type: 'h', text: 'Step 1 - Register & Get Verified' },
    {
      type: 'p',
      text: 'Visit LocumLink.ca or download the LocumLink Canada iOS app. Register using your CPSNS licence details. Once verified, you can apply for available opportunities.',
    },
    { type: 'h', text: 'Step 2 - Complete Your Profile' },
    {
      type: 'p',
      text: 'Add your professional information, qualifications, experience and relevant documents. Your profile information will also be used to automatically populate the GP Locum Application after matching, where applicable.',
    },
    { type: 'h', text: 'Step 3 - Browse Opportunities' },
    {
      type: 'p',
      text: 'Select Browse Opportunities to review available jobs, locations, dates, clinical responsibilities and remuneration.',
    },
    { type: 'h', text: 'Step 4 - Apply' },
    {
      type: 'p',
      text: 'Choose opportunities that suit your availability. You can apply for one, several or all available shifts within a posting. Track your applications under My Applications.',
    },
    { type: 'h', text: 'Step 5 - Get Shortlisted & Connect' },
    {
      type: 'p',
      text: 'If shortlisted, you’ll receive a notification and can communicate with the host through LocumLink messaging. Discuss the position and confirm your availability.',
    },
    { type: 'h', text: 'Step 6 - Accept Your Placement' },
    {
      type: 'p',
      text: 'The host selects and offers you the relevant shifts. Review dates, working hours and remuneration before accepting or declining. Once accepted, your placement becomes Confirmed / Matched.',
    },
    { type: 'h', text: 'Step 7 - GP Locum Application & MSI Approval' },
    {
      type: 'p',
      text: 'For eligible Provincial GP Locum Program placements, LocumLink automatically populates the GP Locum Application using your profile information, the host’s details and confirmed shifts. The host physician downloads the application as a PDF and is responsible for reviewing, completing and submitting it to MSI for approval. Once MSI approves the application, both you and the host physician receive an email confirmation directly from MSI. Ensure approval has been confirmed before starting the assignment.',
    },
    { type: 'h', text: 'Step 8 - Complete Your Assignment & Get Paid' },
    {
      type: 'p',
      text: 'Attend the practice and complete your confirmed shifts. For approved GP Locum Program placements, MSI processes eligible payments following the required billing and claims process. For other placements, payment follows the agreement with the host. LocumLink is completely free for locum physicians.',
    },
    { type: 'h', text: 'Need Help?' },
    {
      type: 'p',
      text: 'Visit Locum Resources for GP Locum Program guidelines, claim forms and other useful information.',
    },
  ],
};

export const HOST_PHYSICIAN_GUIDE: ResourceGuide = {
  id: 'host-physician-guide',
  title: 'LocumLink Host Physician Guide',
  tagline: 'Register. Post. Connect. Match. Get Covered.',
  description:
    'Register, post coverage, confirm a locum, and submit the GP Locum Application to MSI.',
  blocks: [
    {
      type: 'p',
      text: 'LocumLink helps physicians find verified locums and arrange temporary clinical coverage quickly and easily.',
    },
    { type: 'h', text: 'Step 1 - Register & Get Verified' },
    {
      type: 'p',
      text: 'Register as a Host Physician on LocumLink.ca and complete your physician and clinic profile.',
    },
    { type: 'h', text: 'Step 2 - Post Your Opportunity' },
    {
      type: 'p',
      text: 'Select Post a Job and enter your required dates, available shifts, clinical responsibilities and remuneration. You can advertise full-day, half-day or custom shifts.',
    },
    { type: 'h', text: 'Step 3 - Review Applications' },
    {
      type: 'p',
      text: 'Interested locum physicians apply through LocumLink. You’ll receive notifications when applications arrive. Review their profiles and select suitable candidates.',
    },
    { type: 'h', text: 'Step 4 - Shortlist & Connect' },
    {
      type: 'p',
      text: 'Shortlist your preferred applicants to communicate through LocumLink messaging. Discuss availability, expectations and working arrangements.',
    },
    { type: 'h', text: 'Step 5 - Confirm Your Locum' },
    {
      type: 'p',
      text: 'Select the shifts you wish to offer and click Confirm Locum. The locum must accept the offer before the match is finalized. Confirmed shifts are marked as filled, while remaining shifts stay available.',
    },
    { type: 'h', text: 'Step 6 - Matching Fee' },
    {
      type: 'p',
      text: 'Posting opportunities is free. A platform match fee (CA$5 for up to 3.75 claimed hours, or CA$10 when more than 3.75 hours are claimed — testing amounts), plus applicable taxes, applies per successful confirmed match. Multiple shifts covered by the same locum within one opportunity count as one match. Each additional locum represents another match. The matching fee is paid by the host; locum physicians use LocumLink free of charge.',
    },
    { type: 'h', text: 'Step 7 - GP Locum Application & MSI Approval' },
    {
      type: 'p',
      text: 'For eligible Nova Scotia Provincial GP Locum Program placements, LocumLink automatically populates the GP Locum Application Form using host and locum profiles and confirmed coverage dates. The host downloads the completed form as a PDF, reviews and signs it as required, and submits it to MSI for approval. Once approved, MSI sends email confirmation to both the host and locum physicians.',
    },
    { type: 'h', text: 'Step 8 - Coverage & Payment' },
    {
      type: 'p',
      text: 'Following approval, the locum completes the agreed assignment. MSI processes eligible programme payments following the required billing and claims process. For placements outside the provincial programme, payment arrangements are agreed directly between host and locum.',
    },
    { type: 'h', text: 'Need Help?' },
    {
      type: 'p',
      text: 'Visit Host Resources for the GP Locum Application, programme guidelines and further information.',
    },
  ],
};
