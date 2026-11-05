'use client';

import { PublicSiteNav } from '@/components/PublicSiteNav';

type PublicPageShellProps = {
  children: React.ReactNode;
  showSignIn?: boolean;
};

/** Shared layout for public pages (support, about, resources, etc.). */
export function PublicPageShell({ children, showSignIn = true }: PublicPageShellProps) {
  return (
    <div className="public-page-root">
      <PublicSiteNav className="public-page-nav" showSignIn={showSignIn} />
      <main className="public-page-main">{children}</main>
    </div>
  );
}
