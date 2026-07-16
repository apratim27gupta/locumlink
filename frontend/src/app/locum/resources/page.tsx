'use client';
import { useEffect, useState } from 'react';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { locumApi } from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { LocumProfile } from '@/types';

const NAV = [
    { label: 'Browse Opportunities', href: '/locum/browse', icon: <NavIcon name="browse"/> },
    { label: 'My Applications', href: '/locum/dashboard', icon: <NavIcon name="postings"/> },
    { label: 'Profile', href: '/locum/profile', icon: <NavIcon name="profile"/> },
    { label: 'Messages', href: '/locum/messages', icon: <NavIcon name="messages"/> },
    { label: 'Resources', href: '/locum/resources', icon: <NavIcon name="resources"/> },
    { label: 'Settings', href: '/locum/settings', icon: <NavIcon name="settings"/> },
];

const DOCUMENTS = [
    {
        title: 'GP Locum Application Form',
        description: 'Official application form for the GP Locum Program. Download and complete to apply.',
        url: 'https://msi.medavie.bluecross.ca/wp-content/uploads/sites/3/2023/10/GP-Locum-Application-Form.pdf',
    },
    {
        title: 'Locum Program Guidelines',
        description: 'Comprehensive guidelines for the Locum Program, last updated April 2024.',
        url: 'https://msi.medavie.bluecross.ca/wp-content/uploads/sites/3/2024/04/FINAL-Locum-Program-Guidelines-Apr-25-2024.pdf',
    },
    {
        title: 'Locum Program Claim Form',
        description: 'Claim form for the Locum Program covering Jun 15, 2026 – Mar 31, 2027.',
        url: '/documents/locum-program-claim-form-2026-2027.pdf',
    },
];

function PdfIcon() {
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#E0E7FF"/>
            <path d="M10 6h8l6 6v14a2 2 0 01-2 2H10a2 2 0 01-2-2V8a2 2 0 012-2z" fill="#3B4FD8" opacity="0.2"/>
            <path d="M18 6l6 6h-6V6z" fill="#3B4FD8"/>
            <path d="M10 6h8v6h6v14a2 2 0 01-2 2H10a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="#3B4FD8" strokeWidth="1.5" strokeLinejoin="round"/>
            <text x="16" y="23" textAnchor="middle" fill="#3B4FD8" fontSize="6" fontWeight="700" fontFamily="sans-serif">PDF</text>
        </svg>
    );
}

function ExternalLinkIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 2h5m0 0v5m0-5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

export default function LocumResourcesPage(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
    const [profile, setProfile] = useState<LocumProfile | null>(null);
    const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);

    useEffect(() => {
        locumApi
            .getProfile()
            .then((data) => {
                if (data.exists && data.profile) setProfile(data.profile);
            })
            .catch(() => {});
    }, []);

    return (
        <DashLayout navItems={NAV} activeHref="/locum/resources" topbarFirstName={profile?.firstName} topbarLastName={profile?.lastName}>
            <div style={{ maxWidth: 720 }}>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Resources</h1>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {DOCUMENTS.map((doc) => (
                        <a
                            key={doc.url}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onMouseEnter={() => setHoveredUrl(doc.url)}
                            onMouseLeave={() => setHoveredUrl(null)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                padding: '16px 20px',
                                border: `1px solid ${hoveredUrl === doc.url ? '#6366f1' : '#e2e8f0'}`,
                                borderRadius: 10,
                                background: '#fff',
                                textDecoration: 'none',
                                color: 'inherit',
                                transition: 'border-color 0.15s, box-shadow 0.15s',
                                cursor: 'pointer',
                                boxShadow: hoveredUrl === doc.url ? '0 0 0 3px rgba(99,102,241,0.08)' : 'none',
                            }}
                        >
                            <PdfIcon />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b', marginBottom: 2 }}>
                                    {doc.title}
                                </div>
                                <div style={{ fontSize: 13, color: '#64748b' }}>{doc.description}</div>
                            </div>
                            <div style={{ color: '#6366f1', flexShrink: 0 }}>
                                <ExternalLinkIcon />
                            </div>
                        </a>
                    ))}
                </div>
            </div>
        </DashLayout>
    );
}