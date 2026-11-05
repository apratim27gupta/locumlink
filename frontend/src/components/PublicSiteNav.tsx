'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';
import SignInRoleDropdown from '@/components/SignInRoleDropdown';

export const PUBLIC_SITE_NAV_LINKS = [
  { href: '/about', label: 'About us' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/resources', label: 'Resources' },
  { href: '/faq', label: 'FAQs' },
  { href: '/news', label: 'News & updates' },
] as const;

type PublicSiteNavProps = {
  interactive?: boolean;
  showSignIn?: boolean;
  /** Extra class on the outer <nav> (e.g. public-page-nav). */
  className?: string;
};

export function PublicSiteNav({
  interactive = true,
  showSignIn = true,
  className,
}: PublicSiteNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const panelId = useId();

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen, closeMenu]);

  const navClass = ['home-landing-nav', className].filter(Boolean).join(' ');

  return (
    <nav className={navClass} aria-label="Primary">
      <div className="home-landing-nav__inner">
        <Link href="/home" className="home-landing-nav__logo" aria-label="Locum Link home">
          <Logo size="md" />
        </Link>

        <div className="home-landing-nav__links" aria-hidden={menuOpen ? true : undefined}>
          {PUBLIC_SITE_NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`home-landing-nav__link${pathname === item.href || pathname.startsWith(`${item.href}/`) ? ' home-landing-nav__link--active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="home-landing-nav__trailing">
          {showSignIn ? (
            <div className="home-landing-nav__auth">
              <SignInRoleDropdown interactive={interactive} className="home-landing-signin" />
            </div>
          ) : null}

          <button
            type="button"
            className={`home-landing-nav__menu-btn${menuOpen ? ' home-landing-nav__menu-btn--open' : ''}`}
            aria-expanded={menuOpen}
            aria-controls={panelId}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={toggleMenu}
          >
            <span className="home-landing-nav__menu-icon" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div
        className={`home-landing-nav__drawer${menuOpen ? ' home-landing-nav__drawer--open' : ''}`}
        id={panelId}
        hidden={!menuOpen}
      >
        <button
          type="button"
          className="home-landing-nav__drawer-backdrop"
          aria-label="Close menu"
          tabIndex={menuOpen ? 0 : -1}
          onClick={closeMenu}
        />
        <div className="home-landing-nav__drawer-panel" role="dialog" aria-modal="true" aria-label="Site menu">
          <div className="home-landing-nav__drawer-links">
            {PUBLIC_SITE_NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`home-landing-nav__drawer-link${pathname === item.href || pathname.startsWith(`${item.href}/`) ? ' home-landing-nav__drawer-link--active' : ''}`}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="home-landing-nav__drawer-auth">
            {showSignIn ? (
              <SignInRoleDropdown
                interactive={interactive}
                className="home-landing-signin home-landing-signin--drawer"
              />
            ) : null}
            <Link href="/home" className="home-landing-nav__drawer-home" onClick={closeMenu}>
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
