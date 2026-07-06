import Link from 'next/link';
import Logo from '@/components/Logo';

type PublicPageShellProps = {
    children: React.ReactNode;
    showSignIn?: boolean;
};

/** Shared layout for public pages (support, etc.) — matches landing nav and tokens. */
export function PublicPageShell({ children, showSignIn = true }: PublicPageShellProps) {
    return (
        <div className="public-page-root">
            <nav className="home-landing-nav public-page-nav" aria-label="Site">
                <Link href="/home" className="public-page-nav__logo">
                    <Logo size="md" />
                </Link>
                {showSignIn ? (
                    <div className="home-landing-nav__auth">
                        <Link href="/auth" className="btn-signin">
                            Sign in
                        </Link>
                    </div>
                ) : null}
            </nav>
            <main className="public-page-main">{children}</main>
        </div>
    );
}
