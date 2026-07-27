export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqSection = {
  title: string;
  items: FaqItem[];
};

/** Shared host + locum FAQ content, grouped as provided. */
export const LOCUMLINK_FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Frequently Asked Questions & Answers',
    items: [
      {
        question: 'What is LocumLink?',
        answer:
          'LocumLink is a physician-built platform that connects physicians and clinics for locum opportunities across Canada.',
      },
      {
        question: 'Why did you build LocumLink?',
        answer:
          'As practising physicians, we experienced first-hand how time-consuming and fragmented it was to find or advertise locum opportunities. We built LocumLink to simplify that process.',
      },
      {
        question: 'How is LocumLink different from Facebook or WhatsApp groups?',
        answer:
          'Facebook and WhatsApp are excellent communication tools, but they weren’t designed for physician recruitment.\n\nLocumLink provides:\n• verified physicians\n• structured job postings\n• searchable opportunities\n• direct communication\n• one dedicated platform',
      },
      {
        question: 'How is LocumLink different from recruiters or agencies?',
        answer:
          'LocumLink doesn’t replace recruiters.\nIt gives clinics and physicians another option to connect directly while remaining free to use agencies whenever they choose.',
      },
      {
        question: 'Is it only for Nova Scotia?',
        answer:
          'No.\nLocumLink is designed for physicians and clinics across Canada.\nWe are launching in Atlantic Canada first.',
      },
      {
        question: 'Can Family Practice Nurses or Nurse Practitioners use it?',
        answer:
          'Currently no.\nThe initial focus is physicians.\nExpansion into other healthcare professionals may come later.',
      },
      {
        question: 'Is it available on mobile?',
        answer: 'Yes.\nThe iPhone App is now available.\nAndroid is planned.',
      },
      {
        question: 'Do I have to pay?',
        answer:
          'Registration is currently free.\nCommercial pricing will be announced after the pilot.',
      },
      {
        question: 'How long does verification take?',
        answer: 'Usually within 24 hours during business days.',
      },
      {
        question: 'Who verifies physicians?',
        answer:
          'The LocumLink team verifies registration with the provincial medical regulator.',
      },
      {
        question: 'Can I accept locum shifts if I have a work permit?',
        answer: 'It depends on your work permit.\n\nIf you have an employer-specific work permit, you may only be able to work for the employer and/or location listed on your permit.\nIf you have an open work permit, you can generally work for different employers, provided you meet all licensing requirements.\n\nImportant: A medical licence allows you to practise medicine, but your work permit determines where and for whom you can legally work.\n\nLocumLink does not provide immigration advice. Please ensure your work authorization permits the locum position before accepting an assignment.',

      }
    ],
  },
  {
    title: 'Questions We Have Actually Been Asked',
    items: [
      {
        question: 'I’m on the LFM contract. Can I still use LocumLink?',
        answer:
          'Absolutely.\nLocumLink simply helps physicians and clinics connect.\nEligible physicians can still access the Provincial Locum Program if they meet its requirements.',
      },
      {
        question: 'Can I receive the $250/day hosting payment?',
        answer:
          'Yes.\nEligible clinics participating in the Provincial Locum Program may receive the administration/overhead payment in accordance with the program rules.',
      },
      {
        question: 'Does LocumLink replace the Provincial Locum Program?',
        answer:
          'No.\nLocumLink complements existing provincial programs.\nThink of us as the platform that helps physicians and clinics find each other.',
      },
      {
        question: 'Can I use LocumLink if I already use a recruiter?',
        answer:
          'Absolutely.\nMany clinics use multiple recruitment methods.\nLocumLink simply gives you another option.',
      },
      {
        question: 'What provinces are supported?',
        answer:
          'Any Canadian physician or clinic can register.\nOur early commercial focus is Atlantic Canada.',
      },
      {
        question: 'Can specialists use LocumLink?',
        answer:
          'Yes.\nAlthough many early users are family physicians, specialists are welcome.',
      },
      {
        question: 'Can residents register?',
        answer:
          'Residents can create an account, but they should only accept work that they are licensed and credentialed to perform.',
      },
      {
        question: 'Can international medical graduates register?',
        answer:
          'Yes.\nProvided they hold the appropriate licence or registration required to undertake locum work in the relevant province.',
      },
      {
        question: 'How does messaging work?',
        answer:
          'Only once a clinic shortlists a physician.\nThis keeps communication relevant and protects users from unnecessary messages.',
      },
      {
        question: 'How do I post a job?',
        answer:
          'It takes around two minutes.\n• Create an account.\n• Complete your clinic profile.\n• Post your opportunity.\n• Receive applications.\n• Shortlist.\n• Connect.',
      },
      {
        question: 'How do I apply?',
        answer: '• Register.\n• Verify.\n• Browse jobs.\n• Apply.',
      },
      {
        question: 'What if I can’t find a locum?',
        answer:
          'Your opportunity remains visible to verified physicians.\nAs our community grows, so does your reach.',
      },
      {
        question: 'Who owns my data?',
        answer:
          'You do. It’s end-to-end encrypted.\nLocumLink does not sell your personal information.',
      },
      {
        question: 'Can LocumLink guarantee me a locum?',
        answer:
          'No.\nWe facilitate connections between physicians and clinics.\nThe hiring decision always remains with the clinic.',
      },
      {
        question: 'What stage is LocumLink at?',
        answer:
          'We are transitioning from a successful pilot into commercial launch, with our iOS app now live and continued improvements based on user feedback.',
      },
    ],
  },
];
