'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import AppStoreInstallButton from '@/components/AppStoreInstallButton';
import { PublicSiteNav } from '@/components/PublicSiteNav';
import WhatsNewModal from '@/components/WhatsNewModal';
import { SocialLinks } from '@/components/SocialLinks';
import { SupportLegalLinks } from '@/components/SupportLegalLinks';
import { ROLE_GUIDE } from '@/lib/roleAccent';
import { VOLTA_URL } from '@/lib/support';

function HomeLandingLegalLinks() {
  return <SupportLegalLinks variant="landing" />;
}

export type HomeLandingViewProps = {
  interactive?: boolean;
  rootStyle?: React.CSSProperties;
  /** Kept for callers; hero no longer shows live job counts. */
  initialActiveJobCount?: number;
};

export function HomeLandingView({
  interactive = true,
  rootStyle,
}: HomeLandingViewProps) {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  const closeWhatsNew = useCallback(() => {
    setWhatsNewOpen(false);
    if (typeof window !== 'undefined' && window.location.hash === '#whats-new') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    if (!interactive) return;
    const maybeOpen = () => {
      if (window.location.hash === '#whats-new') setWhatsNewOpen(true);
    };
    maybeOpen();
    window.addEventListener('hashchange', maybeOpen);
    return () => window.removeEventListener('hashchange', maybeOpen);
  }, [interactive]);

  return (
    <div
      className="home-landing-root"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
        ...rootStyle,
      }}
    >
      <WhatsNewModal open={whatsNewOpen} onClose={closeWhatsNew} />

      <header className="home-landing-header">
        <PublicSiteNav interactive={interactive} showSignIn />
      </header>

      <div id="whats-new" className="home-landing-announce">
        <div className="home-landing-announce__inner">
          <span className="home-landing-announce__badge">New on LocumLink</span>
          <p className="home-landing-announce__copy">
            Half-day coverage blocks are now available.
          </p>
          <Link href="/news#release" className="home-landing-announce__cta">
            See what&apos;s new <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      <main className="home-landing-main">
        <div className="home-landing-body">
          <section className="home-landing-hero" id="about">
            <p className="home-landing-hero__tagline">CONNECT. COVER. CARE.</p>
            <h1 className="home-landing-h1 home-landing-hero__headline">
              Find locum coverage and shifts across Nova Scotia.
            </h1>
            <p className="home-landing-subhead home-landing-hero__subhead">
              Built by physicians, for physicians. Find coverage or your next locum opportunity in one
              place.
            </p>

            <div id="how-it-works" className="home-landing-actions home-landing-hero__actions">
              {interactive ? (
                <>
                  <span className="role-guide" data-tip={ROLE_GUIDE.clinic}>
                    <Link
                      href="/auth?mode=signin&role=clinic&locked=true"
                      className="btn-landing-cta"
                      aria-label={`Post a Locum Request. ${ROLE_GUIDE.clinic}`}
                    >
                      Post a Locum Request
                    </Link>
                  </span>
                  <span className="role-guide" data-tip={ROLE_GUIDE.locum}>
                    <Link
                      href="/locum/browse"
                      className="btn-landing-cta btn-landing-cta--teal"
                      aria-label={`Browse Locum Shifts. ${ROLE_GUIDE.locum}`}
                    >
                      Browse Locum Shifts
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <span className="role-guide" data-tip={ROLE_GUIDE.clinic}>
                    <span className="btn-landing-cta" style={{ pointerEvents: 'none' }}>
                      Post a Locum Request
                    </span>
                  </span>
                  <span className="role-guide" data-tip={ROLE_GUIDE.locum}>
                    <span className="btn-landing-cta btn-landing-cta--teal" style={{ pointerEvents: 'none' }}>
                      Browse Locum Shifts
                    </span>
                  </span>
                </>
              )}
            </div>

            <div className="home-landing-hero__badges" id="faqs">
              {['✓ Verified physicians', '✓ Direct connections', '✓ Flexible shifts'].map((badge) => (
                <span key={badge} className="home-landing-hero__badge">
                  {badge}
                </span>
              ))}
            </div>
          </section>
        </div>

        <footer className="home-landing-footer">
          <div className="home-landing-footer-credits">
            <div className="home-landing-footer-credits__inner">
              {interactive ? (
                <div className="home-landing-footer-credits__row home-landing-footer-credits__row--actions">
                  <HomeLandingLegalLinks />
                  <div className="home-landing-footer-follow-volta">
                    <div className="home-landing-footer-follow">
                      <span className="home-landing-footer-follow__label">Follow us:</span>
                      <SocialLinks
                        className="site-social-links site-social-links--footer"
                        iconSize={28}
                      />
                    </div>
                    <span className="home-landing-footer-follow-volta__divider" aria-hidden />
                    <a
                      href={VOLTA_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="home-landing-volta home-landing-volta--inline"
                      aria-label="A Volta Resident Company"
                    >
                      <span className="home-landing-volta-row">
                        <Image
                          src="/volta.svg"
                          alt=""
                          width={72}
                          height={28}
                          className="home-landing-volta-logo"
                        />
                        <span className="home-landing-volta-divider" aria-hidden />
                        <span className="home-landing-volta-label">A Volta Resident Company</span>
                      </span>
                    </a>
                  </div>
                </div>
              ) : null}
              <div className="home-landing-footer-credits__row home-landing-footer-credits__row--bottom">
                <div className="home-landing-footer-credits-left">
                  <p className="home-landing-copyright">© LocumLink 2026</p>
                  <p className="home-landing-powered-by">
                    Developed by{' '}
                    <a
                      href="https://www.aebeolleconsulting.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="home-landing-powered-by__link"
                    >
                      Aebeolle Consulting
                    </a>
                  </p>
                </div>
                {interactive ? (
                  <div className="home-landing-footer-bar__right home-landing-footer-bar__right--bottom">
                    <AppStoreInstallButton
                      variant="landing-nav"
                      className="home-landing-footer-appstore"
                    />
                    <Link
                      href="/admin/login"
                      className="home-admin-login-btn home-admin-login-btn--inline home-admin-login-btn--footer"
                    >
                      Admin login
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
