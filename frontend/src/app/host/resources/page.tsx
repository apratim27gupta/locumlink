'use client';
import { useEffect, useState } from 'react';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import ResourceGuideArticle from '@/components/ResourceGuideArticle';
import { hostApi } from '@/lib/api';
import { HOST_PHYSICIAN_GUIDE, sortResourcesByTitle } from '@/lib/resourceGuides';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { HostProfile } from '@/types';

const NAV = [
    {
        label: 'My Postings',
        href: '/host/dashboard',
        icon: <NavIcon name="postings"/>,
    },
    { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile"/> },
    {
        label: 'Messages',
        href: '/host/messages',
        icon: <NavIcon name="messages"/>,
    },
    {
        label: 'Resources',
        href: '/host/resources',
        icon: <NavIcon name="resources"/>,
    },
    {
        label: 'FAQs',
        href: '/host/faq',
        icon: <NavIcon name="faq"/>,
    },
    {
        label: 'Settings',
        href: '/host/settings',
        icon: <NavIcon name="settings"/>,
    },
];

const DOCUMENTS = [
    {
        title: 'GP Locum Application Form',
        description: 'Official application form for the GP Locum Program. Download and complete to apply.',
        url: 'https://msi.medavie.bluecross.ca/wp-content/uploads/sites/3/2023/10/GP-Locum-Application-Form.pdf',
        icon: 'pdf' as const,
    },
    {
        title: 'Locum Program Guidelines',
        description: 'Comprehensive guidelines for the Locum Program, last updated April 2024.',
        url: 'https://msi.medavie.bluecross.ca/wp-content/uploads/sites/3/2024/04/FINAL-Locum-Program-Guidelines-Apr-25-2024.pdf',
        icon: 'pdf' as const,
    },
    {
        title: 'Locum Program Claim Form',
        description: 'Claim form for the Locum Program covering Jun 15, 2026 – Mar 31, 2027.',
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

type ResourceItem =
    | { kind: 'guide'; id: string; title: string; description: string }
    | { kind: 'external'; title: string; description: string; url: string; icon: 'pdf' | 'link' };

const RESOURCES: ResourceItem[] = sortResourcesByTitle([
    {
        kind: 'guide',
        id: HOST_PHYSICIAN_GUIDE.id,
        title: HOST_PHYSICIAN_GUIDE.title,
        description: HOST_PHYSICIAN_GUIDE.description,
    },
    ...DOCUMENTS.map((doc) => ({ kind: 'external' as const, ...doc })),
]);

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

function LinkTileIcon() {
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#E0E7FF"/>
            <path
                d="M14.5 17.5l3-3M12.2 15.8l-1.4 1.4a3.2 3.2 0 004.5 4.5l1.4-1.4M19.8 16.2l1.4-1.4a3.2 3.2 0 00-4.5-4.5l-1.4 1.4"
                stroke="#3B4FD8"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function GuideIcon() {
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#E0E7FF"/>
            <path d="M9 8.5h14v15H9z" fill="#3B4FD8" opacity="0.15"/>
            <path d="M11 11.5h10M11 15h10M11 18.5h7" stroke="#3B4FD8" strokeWidth="1.6" strokeLinecap="round"/>
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

function ChevronIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

export default function HostResourcesPage(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
    const [profile, setProfile] = useState<HostProfile | null>(null);
    const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        hostApi
            .getProfile()
            .then((data) => setProfile(data ?? null))
            .catch(() => {});
    }, []);

    return (
        <DashLayout navItems={NAV} activeHref="/host/resources" topbarFirstName={profile?.contactFirstName} topbarLastName={profile?.contactLastName}>
            <div style={{ maxWidth: 720 }}>
                {showGuide ? (
                    <>
                        <button
                            type="button"
                            onClick={() => setShowGuide(false)}
                            style={{
                                border: 'none',
                                background: 'none',
                                padding: 0,
                                marginBottom: 16,
                                color: '#3B4FD8',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            ← Back to Resources
                        </button>
                        <ResourceGuideArticle guide={HOST_PHYSICIAN_GUIDE} />
                    </>
                ) : (
                    <>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Resources</h1>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {RESOURCES.map((item) => {
                        const hoverKey = item.kind === 'guide' ? item.id : item.url;
                        const tileStyle = {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            padding: '16px 20px',
                            border: `1px solid ${hoveredUrl === hoverKey ? '#6366f1' : '#e2e8f0'}`,
                            borderRadius: 10,
                            background: '#fff',
                            color: 'inherit',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            cursor: 'pointer',
                            boxShadow: hoveredUrl === hoverKey ? '0 0 0 3px rgba(99,102,241,0.08)' : 'none',
                            fontFamily: 'inherit',
                            width: '100%',
                            textAlign: 'left' as const,
                        };
                        const body = (
                            <>
                                {item.kind === 'guide' ? (
                                    <GuideIcon />
                                ) : item.icon === 'link' ? (
                                    <LinkTileIcon />
                                ) : (
                                    <PdfIcon />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b', marginBottom: 2 }}>
                                        {item.title}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>{item.description}</div>
                                </div>
                                <div style={{ color: '#6366f1', flexShrink: 0 }}>
                                    {item.kind === 'guide' ? <ChevronIcon /> : <ExternalLinkIcon />}
                                </div>
                            </>
                        );
                        if (item.kind === 'guide') {
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setShowGuide(true)}
                                    onMouseEnter={() => setHoveredUrl(item.id)}
                                    onMouseLeave={() => setHoveredUrl(null)}
                                    style={tileStyle}
                                >
                                    {body}
                                </button>
                            );
                        }
                        return (
                            <a
                                key={item.url}
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onMouseEnter={() => setHoveredUrl(item.url)}
                                onMouseLeave={() => setHoveredUrl(null)}
                                style={{ ...tileStyle, textDecoration: 'none' }}
                            >
                                {body}
                            </a>
                        );
                    })}
                </div>
                    </>
                )}
            </div>
        </DashLayout>
    );
}
