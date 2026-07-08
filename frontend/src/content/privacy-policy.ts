export type LegalSection = {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
    subsections?: {
        title: string;
        bullets?: string[];
        paragraphs?: string[];
    }[];
};

export type LegalDocument = {
    title: string;
    effectiveDate: string;
    sections: LegalSection[];
};

export const PRIVACY_POLICY: LegalDocument = {
    title: 'Locum Link Privacy Policy',
    effectiveDate: 'June 20, 2026',
    sections: [
        {
            title: 'Introduction',
            paragraphs: [
                'LocumLink is a healthcare workforce platform designed to connect healthcare professionals and healthcare organizations for locum and employment opportunities.',
                'This Privacy Policy explains how LocumLink collects, uses, stores, and protects information provided through the platform.',
                'By creating an account or using LocumLink, you agree to this Privacy Policy.',
            ],
        },
        {
            title: 'Information We Collect',
            subsections: [
                {
                    title: 'Healthcare Professionals',
                    bullets: [
                        'Name',
                        'Email address',
                        'Professional registration details',
                        'Resume',
                        'Practice preferences',
                        'Availability information',
                        'Current CPSNS Licence to Practise document uploaded for verification',
                    ],
                },
                {
                    title: 'Healthcare Organizations',
                    bullets: [
                        'Organization name',
                        'Contact name',
                        'Contact email address',
                        'Clinic or facility profile information',
                        'Job posting information',
                        'Communications made through the platform',
                    ],
                },
                {
                    title: 'Technical Information',
                    bullets: [
                        'Login activity',
                        'Browser and device information',
                        'IP address',
                        'Usage information',
                        'Security and audit logs',
                    ],
                },
            ],
        },
        {
            title: 'Information We Do Not Collect',
            paragraphs: [
                'LocumLink is not intended to collect, store, process, or transmit:',
                'Users must not upload patient information to the platform.',
            ],
            bullets: [
                'Patient medical records',
                'Personal health information',
                'Clinical documentation',
                'Diagnostic information',
                'Patient-identifiable information',
            ],
        },
        {
            title: 'How We Use Information',
            bullets: [
                'Create and manage user accounts',
                'Verify CPSNS licensure documentation',
                'Facilitate matching between healthcare professionals and healthcare organizations',
                'Support applications and job postings',
                'Enable communication between users',
                'Provide notifications and status updates',
                'Improve platform functionality',
                'Maintain platform security',
                'Comply with legal obligations',
            ],
        },
        {
            title: 'Credential Verification',
            bullets: [
                'Healthcare professionals who wish to apply for opportunities or create postings through LocumLink may be required to upload a current CPSNS Licence to Practise document.',
                'LocumLink administrators may review submitted CPSNS documentation before granting application, posting, or messaging privileges.',
                'Verification by LocumLink is limited to confirmation that the submitted CPSNS Licence to Practise document appeared valid at the time of review.',
            ],
            subsections: [
                {
                    title: 'LocumLink does not verify:',
                    bullets: [
                        'Work eligibility in Canada',
                        'Citizenship or immigration status',
                        'Atlantic Registry participation',
                        'MSI registration',
                        'MINC registration',
                        'CMPA coverage',
                        'Doctors Nova Scotia membership',
                        'Clinical privileges',
                        'Professional competence',
                        'Ongoing licensure status after verification',
                    ],
                    paragraphs: [
                        'Healthcare organizations remain responsible for conducting their own credentialing and due diligence processes.',
                    ],
                },
            ],
        },
        {
            title: 'Information Sharing',
            paragraphs: ['LocumLink does not sell personal information.'],
            bullets: [
                'Between healthcare professionals and healthcare organizations using the platform',
                'With service providers supporting platform operations',
                'Where required by law or regulatory authorities',
                'To protect the rights, safety, and security of LocumLink or its users',
            ],
        },
        {
            title: 'Data Security',
            paragraphs: [
                'LocumLink employs reasonable administrative, technical, and organizational safeguards including:',
            ],
            bullets: [
                'Encrypted document storage',
                'Role-based access controls',
                'Authentication safeguards',
                'Audit logging',
                'Security monitoring',
            ],
            subsections: [
                {
                    title: '',
                    paragraphs: ['No system can guarantee absolute security.'],
                },
            ],
        },
        {
            title: 'Data Retention',
            paragraphs: [
                'Information may be retained while accounts remain active and for a reasonable period thereafter for:',
            ],
            bullets: [
                'Verification purposes',
                'Compliance obligations',
                'Security monitoring',
                'Audit requirements',
                'Dispute resolution',
            ],
        },
        {
            title: 'User Rights',
            paragraphs: ['Users may request:'],
            bullets: [
                'Access to their information',
                'Correction of inaccurate information',
                'Deletion of information where legally permitted',
            ],
        },
        {
            title: 'Changes to this Policy',
            paragraphs: [
                'LocumLink may update this Privacy Policy periodically. Updated versions will be posted on the website.',
            ],
        },
        {
            title: 'Contact',
            paragraphs: [
                'Privacy Officer',
                'LocumLink',
                'Email: info@locumlink.ca',
            ],
        },
    ],
};
