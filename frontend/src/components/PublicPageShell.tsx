'use client';

import { PublicSiteNav } from '@/components/PublicSiteNav';

type PublicPageShellProps = {
  children: React.ReactNode;
  showSignIn?: boolean;
  showRequestDemo?: boolean;
};

/** Shared layout for public pages (support, about, resources, etc.). */
export function PublicPageShell({
  children,
  showSignIn = true,
  showRequestDemo = true,
}: PublicPageShellProps) {
  return (
    <div className="public-page-root">
      <PublicSiteNav
        className="public-page-nav"
        showSignIn={showSignIn}
        showRequestDemo={showRequestDemo}
      />
      <main className="public-page-main">{children}</main>
    </div>
  );
}
