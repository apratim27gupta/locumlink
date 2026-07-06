import Link from 'next/link';
import {
    PRIVACY_POLICY_PATH,
    SUPPORT_PAGE_PATH,
    TERMS_OF_USE_PATH,
} from '@/lib/support';

type SupportLegalLinksProps = {
    variant: 'sidebar' | 'landing';
    onNavigate?: () => void;
};

export function SupportLegalLinks({ variant, onNavigate }: SupportLegalLinksProps) {
    if (variant === 'sidebar') {
        return (
            <div className="dash-sidebar-footer-links">
                <Link
                    href={SUPPORT_PAGE_PATH}
                    onClick={onNavigate}
                    className="dash-sidebar-footer-link"
                >
                    Support
                </Link>
                <a
                    href={PRIVACY_POLICY_PATH}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onNavigate}
                    className="dash-sidebar-footer-link"
                >
                    Privacy Policy
                </a>
                <a
                    href={TERMS_OF_USE_PATH}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onNavigate}
                    className="dash-sidebar-footer-link"
                >
                    Terms of Use
                </a>
            </div>
        );
    }

    return (
        <>
            <Link href={SUPPORT_PAGE_PATH} className="home-landing-doc-link" onClick={onNavigate}>
                Support
            </Link>
            <a
                href={TERMS_OF_USE_PATH}
                className="home-landing-doc-link"
                target="_blank"
                rel="noopener noreferrer"
            >
                Terms of Use
            </a>
            <a
                href={PRIVACY_POLICY_PATH}
                className="home-landing-doc-link"
                target="_blank"
                rel="noopener noreferrer"
            >
                Privacy Policy
            </a>
        </>
    );
}
