import type { LegalDocument } from '@/content/privacy-policy';

export const TERMS_OF_USE: LegalDocument = {
    title: 'Locum Link Terms of Use',
    effectiveDate: 'June 20, 2026',
    sections: [
        {
            title: 'Acceptance of Terms',
            bullets: [
                'By accessing or using LocumLink, you agree to be bound by these Terms of Use.',
                'If you do not agree with these Terms, you must not use the platform.',
            ],
        },
        {
            title: 'Platform Purpose',
            bullets: [
                'LocumLink is a technology platform that facilitates connections between healthcare professionals and healthcare organizations.',
                'LocumLink is not an employer, recruitment agency, staffing agency, healthcare provider, regulator, licensing authority, or credentialing body.',
            ],
        },
        {
            title: 'Eligibility',
            paragraphs: ['Users must:'],
            bullets: [
                'Be at least 18 years of age',
                'Be legally capable of entering into agreements',
                'Provide accurate and complete information',
                'Maintain current account information',
            ],
        },
        {
            title: 'Browsing, Posting and Application Permissions',
            paragraphs: [
                'Users may browse publicly available opportunities on LocumLink without verification.',
                'Healthcare professionals who wish to apply for opportunities must:',
            ],
            bullets: [
                'Create an account',
                'Upload a current CPSNS Licence to Practise document',
                'Complete the LocumLink verification process',
            ],
            subsections: [
                {
                    title: 'Healthcare organizations or physicians who wish to post opportunities must:',
                    bullets: [
                        'Create an account',
                        'Complete LocumLink verification requirements',
                        'Maintain accurate profile information',
                    ],
                    paragraphs: [
                        'LocumLink may restrict posting, application, or messaging functionality until verification has been completed.',
                    ],
                },
            ],
        },
        {
            title: 'Professional Verification',
            bullets: [
                'LocumLink may request a current CPSNS Licence to Practise document to verify eligibility to use certain platform features.',
                'Verification by LocumLink is limited to review of CPSNS licensure documentation.',
                'Verification indicates only that submitted documentation appeared valid at the time of review.',
            ],
            subsections: [
                {
                    title: 'LocumLink does not guarantee:',
                    bullets: [
                        'Ongoing licensure',
                        'Good standing',
                        'Professional competence',
                        'Clinical suitability',
                        'Employment eligibility',
                        'Regulatory compliance',
                    ],
                    paragraphs: [
                        'Healthcare organizations remain solely responsible for their own credentialing, hiring, privileging, and due diligence processes.',
                    ],
                },
            ],
        },
        {
            title: 'Responsibilities of Healthcare Professionals',
            paragraphs: ['Healthcare professionals are solely responsible for:'],
            bullets: [
                'Maintaining valid licensure',
                'Maintaining professional liability coverage',
                'Compliance with applicable regulations',
                'Accuracy of information submitted to the platform',
            ],
        },
        {
            title: 'Responsibilities of Healthcare Organizations',
            paragraphs: ['Healthcare organizations remain solely responsible for:'],
            bullets: [
                'Hiring decisions',
                'Reference checks',
                'Credential verification',
                'Regulatory compliance',
                'Employment agreements',
                'Contractor agreements',
                'Clinical privileging decisions',
            ],
        },
        {
            title: 'Acceptable Use',
            paragraphs: ['Users must not:'],
            bullets: [
                'Provide false or misleading information',
                'Upload fraudulent documentation',
                'Upload patient information',
                'Misrepresent professional qualifications',
                "Access another user's account",
                'Interfere with platform operations',
                'Attempt unauthorized access to systems',
                'Use automated scraping or harvesting tools',
            ],
        },
        {
            title: 'Messaging and Communications',
            paragraphs: [
                'Users are responsible for communications conducted through the platform.',
                'LocumLink does not monitor, endorse, or guarantee the accuracy of user communications.',
            ],
        },
        {
            title: 'Intellectual Property',
            paragraphs: [
                'All software, branding, logos, content, workflows, and technology associated with LocumLink remain the property of LocumLink unless otherwise stated.',
                'Users may not reproduce, distribute, modify, or exploit platform content without permission.',
            ],
        },
        {
            title: 'Availability',
            bullets: [
                'LocumLink may modify, suspend, or discontinue any feature without notice.',
                'LocumLink does not guarantee uninterrupted or error-free service.',
            ],
        },
        {
            title: 'Limitation of Liability',
            paragraphs: ['To the fullest extent permitted by law, LocumLink shall not be liable for:'],
            bullets: [
                'Hiring decisions',
                'Employment disputes',
                'Contractor disputes',
                'Credential inaccuracies',
                'Regulatory decisions',
                'Lost opportunities',
                'Lost profits',
                'Indirect, incidental, or consequential damages',
            ],
            subsections: [
                {
                    title: '',
                    paragraphs: ["Use of the platform is entirely at the user's own risk."],
                },
            ],
        },
        {
            title: 'Indemnification',
            paragraphs: [
                'Users agree to indemnify and hold harmless LocumLink, its officers, directors, employees, contractors, and affiliates from claims arising from:',
            ],
            bullets: [
                'User conduct',
                'User content',
                'Regulatory violations',
                'Breaches of these Terms',
            ],
        },
        {
            title: 'Suspension and Termination',
            paragraphs: ['LocumLink may suspend or terminate accounts where:'],
            bullets: [
                'Terms are violated',
                'Fraud is suspected',
                'Security concerns arise',
                'Regulatory concerns arise',
            ],
        },
        {
            title: 'Governing Law',
            paragraphs: [
                'These Terms shall be governed by the laws of Nova Scotia and the applicable laws of Canada.',
            ],
        },
        {
            title: 'Contact',
            paragraphs: ['LocumLink', 'Email: support@locumlink.ca'],
        },
    ],
};
