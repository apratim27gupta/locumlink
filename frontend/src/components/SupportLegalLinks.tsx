'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    PRIVACY_POLICY_PATH,
    SUPPORT_PAGE_PATH,
    TERMS_OF_USE_PATH,
    legalPageHref,
} from '@/lib/support';

type SupportLegalLinksProps = {
    variant: 'sidebar' | 'landing';
    onNavigate?: () => void;
};

export function SupportLegalLinks({ variant, onNavigate }: SupportLegalLinksProps) {
    const pathname = usePathname();

    if (variant === 'sidebar') {
        return (
            <div className="dash-sidebar-footer-links">
                <Link
                    href={legalPageHref(SUPPORT_PAGE_PATH, pathname)}
                    onClick={onNavigate}
                    className="dash-sidebar-footer-link"
                >
                    Support
                </Link>
                <Link
                    href={legalPageHref(PRIVACY_POLICY_PATH, pathname)}
                    onClick={onNavigate}
                    className="dash-sidebar-footer-link"
                >
                    Privacy Policy
                </Link>
                <Link
                    href={legalPageHref(TERMS_OF_USE_PATH, pathname)}
                    onClick={onNavigate}
                    className="dash-sidebar-footer-link"
                >
                    Terms of Use
                </Link>
            </div>
        );
    }

    return (
        <>
            <Link href={SUPPORT_PAGE_PATH} className="home-landing-doc-link" onClick={onNavigate}>
                Support
            </Link>
            <Link href={TERMS_OF_USE_PATH} className="home-landing-doc-link">
                Terms of Use
            </Link>
            <Link href={PRIVACY_POLICY_PATH} className="home-landing-doc-link">
                Privacy Policy
            </Link>
        </>
    );
}
