'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { landingApi, locumApi } from '@/lib/api';
import { beforeClientNavigation } from '@/lib/topLoader';

const LANDING_AVATAR_FALLBACKS = [
    '/avatar-1.jpeg',
    '/avatar-2.jpeg',
    '/avatar-clinic.png',
] as const;

function footerAvatarSources(hostUrls: string[]): string[] {
    const uniqueHosts = [...new Set(hostUrls)].slice(0, 3);
    if (uniqueHosts.length >= 3) return uniqueHosts;
    if (uniqueHosts.length === 0) return [...LANDING_AVATAR_FALLBACKS];
    return [...uniqueHosts, ...LANDING_AVATAR_FALLBACKS].slice(0, 3);
}

function HomeLandingLegalLinks() {
    return (
        <>
            <a
                href="/terms"
                className="home-landing-doc-link"
                target="_blank"
                rel="noopener noreferrer"
            >
                Terms of use
            </a>
            <a
                href="/privacy"
                className="home-landing-doc-link"
                target="_blank"
                rel="noopener noreferrer"
            >
                Privacy Policy
            </a>
        </>
    );
}
export type HomeLandingViewProps = {
    interactive?: boolean;
    rootStyle?: React.CSSProperties;
    /** Server-provided count of ACTIVE job postings; avoids "—" before client fetch. */
    initialActiveJobCount?: number;
};
export function HomeLandingView({ interactive = true, rootStyle, initialActiveJobCount, }: HomeLandingViewProps) {
    const router = useRouter();
    const [browseOpportunityCount, setBrowseOpportunityCount] = useState<number | null>(
        initialActiveJobCount ?? null,
    );
    const [recentHostAvatars, setRecentHostAvatars] = useState<string[]>([]);

    const goToAuth = (href: string) => {
        beforeClientNavigation(href);
        router.push(href);
    };
    useEffect(() => {
        let cancelled = false;
        locumApi
            .getBrowseOpportunitiesCount()
            .then(({ count }) => {
            if (!cancelled)
                setBrowseOpportunityCount(count);
        })
            .catch(() => {
            if (!cancelled)
                setBrowseOpportunityCount(initialActiveJobCount ?? null);
        });
        landingApi
            .getRecentHostAvatars()
            .then(({ avatars }) => {
            if (!cancelled)
                setRecentHostAvatars(avatars);
        })
            .catch(() => {
            if (!cancelled)
                setRecentHostAvatars([]);
        });
        return () => {
            cancelled = true;
        };
    }, [initialActiveJobCount]);
    const mainOverflow = interactive ? 'auto' : 'hidden';
    const opportunityCountLabel = browseOpportunityCount !== null
        ? browseOpportunityCount.toLocaleString('en-CA')
        : '—';
    return (<div className="home-landing-root" style={{
            position: 'relative',
            height: '100vh',
            maxHeight: '100vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, sans-serif',
            ...rootStyle,
        }}>
      <nav className="home-landing-nav">
        <Logo size="md" />

        <div className="home-landing-nav__auth">
          <button
            type="button"
            className={`btn-signin ${!interactive ? 'btn-signin--disabled' : ''}`}
            disabled={!interactive}
            onClick={() => goToAuth('/auth?mode=signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className="btn-signup"
            disabled={!interactive}
            onClick={() => goToAuth('/auth')}
          >
            Sign Up
          </button>
        </div>
      </nav>

      <main className="home-landing-main" style={{
            flex: '1 1 0',
            minHeight: 0,
            marginTop: 76,
            overflowY: mainOverflow,
            overflowX: 'hidden',
            background: '#F7F8FA',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '56px 24px 48px',
            boxSizing: 'border-box',
        }}>
        <div style={{
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: 1001,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 36,
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
        }}>
            <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
        }}>
              <span className="home-landing-h1" style={{
            fontFamily: 'var(--font-display), Outfit, sans-serif',
            fontWeight: 700,
            fontSize: 44,
            lineHeight: '100%',
            color: '#0B0F1F',
            textAlign: 'center',
        }}>
                Find Verified Locums in as Fast as 48 Hours
              </span>
              <span className="home-landing-h1" style={{
            fontFamily: 'var(--font-display), Outfit, sans-serif',
            fontWeight: 700,
            fontSize: 44,
            lineHeight: '100%',
            color: '#0B0F1F',
            textAlign: 'center',
        }}>
                
              </span>
            </div>

            <p className="home-landing-subhead" style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 400,
            fontSize: 26,
            lineHeight: '132%',
            color: '#2A3050',
            textAlign: 'center',
            maxWidth: '100%',
            margin: 0,
        }}>
              Built for Nova Scotia physicians. Post a request and connect directly with qualified locums - without agency fees or endless back-and-forth.
            </p>
            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
              {['✓ Verified physicians','✓ Direct clinic-to-doctor matching','✓ No agency fees','✓ Built for Nova Scotia'].map((badge) => (<span key={badge} style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 14px', borderRadius: 999, background: '#EEF2FF', color: '#1B31D2', fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 14 }}>{badge}</span>))}
            </div>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
        }} className="home-landing-actions">
            {interactive ? (<>
                <Link href="/auth?role=clinic&locked=true" className="btn-landing-cta">
                  Post a Locum Request
                </Link>
                <Link href="/auth?role=locum&locked=true" className="btn-signin">
                  Browse Locum Shifts
                </Link>
              </>) : (<>
                <span className="btn-landing-cta" style={{ pointerEvents: 'none' }}>
                  Post a Locum Request
                </span>
                <span className="btn-signin" style={{ pointerEvents: 'none' }}>
                  Browse Locum Shifts
                </span>
              </>)}
          </div>
        </div>

        <div style={{
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: 1001,
            marginTop: 40,
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            padding: '20px 28px',
            background: '#FFFFFF',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 0,
        }}>
            <p style={{
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            fontSize: 18,
            lineHeight: '140%',
            color: '#0B0F1F',
        }}>
              <span style={{ fontWeight: 700, fontSize: 22 }}>{opportunityCountLabel}</span>
              <span style={{ fontWeight: 400 }}>
                {' '}
                active job postings across Nova Scotia
              </span>
            </p>
            <span style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 400,
            fontSize: 15,
            lineHeight: '140%',
            color: '#6B7280',
        }}>
              Find your ideal fit
            </span>
          </div>
          {interactive ? (<Link href="/locum/browse" style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                fontSize: 18,
                color: '#1B31D2',
                textDecoration: 'none',
            }}>
              View
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                →
              </span>
            </Link>) : (<span style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                fontSize: 18,
                color: '#1B31D2',
            }}>
              View
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                →
              </span>
            </span>)}
        </div>

        <footer style={{
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: 934,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 10,
            gap: 24,
            marginTop: 'auto',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px 24px',
            width: '100%',
            maxWidth: 934,
        }}>
            {[
            'Built by a Nova Scotia family physician',
            'CPSNS-ready verification',
            'Designed for real clinic workflows',
        ].map((t) => (<span key={t} style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 400,
                fontSize: 16,
                color: '#606061',
            }}>
                {t}
              </span>))}
          </div>
          {interactive ? (
            <div className="home-landing-footer-bar">
              <div className="home-landing-doc-links home-landing-doc-links--inline">
                <HomeLandingLegalLinks />
              </div>
              <Link href="/admin/login" className="home-admin-login-btn home-admin-login-btn--inline">
                Admin login
              </Link>
            </div>
          ) : null}
        </footer>
      </main>

      {interactive ? (
        <>
          <div className="home-landing-doc-links home-landing-doc-links--fixed">
            <HomeLandingLegalLinks />
          </div>
          <Link href="/admin/login" className="home-admin-login-btn home-admin-login-btn--fixed">
            Admin login
          </Link>
        </>
      ) : null}
    </div>);
}
