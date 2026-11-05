import {
  HOST_PHYSICIAN_GUIDE,
  LOCUM_PHYSICIAN_GUIDE,
  sortResourcesByTitle,
} from '@/lib/resourceGuides';

/** Shared PDFs / external links used on host, locum, and public Resources pages. */
export const SHARED_RESOURCE_DOCUMENTS = [
  {
    title: 'GP Locum Application Form',
    description:
      'Official application form for the GP Locum Program. After a locum accepts, hosts can download a pre-filled copy from Applicants.',
    url: '/documents/gp-locum-application-form.pdf',
    icon: 'pdf' as const,
  },
  {
    title: 'Locum Program Guidelines',
    description:
      'Comprehensive guidelines for the Locum Program, last updated April 2024.',
    url: 'https://doctorsns.com/contract-and-support/master-agreement/programs-funding/locum-program',
    icon: 'link' as const,
  },
  {
    title: 'Locum Program Claim Form',
    description:
      'Claim form for the Locum Program covering Jun 15, 2026 – Mar 31, 2027.',
    url: '/documents/locum-program-claim-form-2026-2027.pdf',
    icon: 'pdf' as const,
  },
  {
    title: 'Atlantic Registry',
    description:
      'Find out how and when to register with your Atlantic College to practise in all four Atlantic provinces',
    url: 'https://cpsns.ns.ca/registrants/physicians/your-practice/atlantic-registry/',
    icon: 'link' as const,
  },
];

export type SharedResourceDocument = (typeof SHARED_RESOURCE_DOCUMENTS)[number];

export type PublicResourceItem =
  | { kind: 'guide'; id: string; title: string; description: string }
  | {
      kind: 'external';
      title: string;
      description: string;
      url: string;
      icon: 'pdf' | 'link';
    };

/** Public landing Resources: both physician guides + shared documents. */
export const PUBLIC_RESOURCES: PublicResourceItem[] = sortResourcesByTitle([
  {
    kind: 'guide',
    id: HOST_PHYSICIAN_GUIDE.id,
    title: HOST_PHYSICIAN_GUIDE.title,
    description: HOST_PHYSICIAN_GUIDE.description,
  },
  {
    kind: 'guide',
    id: LOCUM_PHYSICIAN_GUIDE.id,
    title: LOCUM_PHYSICIAN_GUIDE.title,
    description: LOCUM_PHYSICIAN_GUIDE.description,
  },
  ...SHARED_RESOURCE_DOCUMENTS.map((doc) => ({
    kind: 'external' as const,
    ...doc,
  })),
]);

export function findPublicGuide(id: string) {
  if (id === HOST_PHYSICIAN_GUIDE.id) return HOST_PHYSICIAN_GUIDE;
  if (id === LOCUM_PHYSICIAN_GUIDE.id) return LOCUM_PHYSICIAN_GUIDE;
  return null;
}
