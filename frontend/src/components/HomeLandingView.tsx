'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { locumApi } from '@/lib/api';
export type HomeLandingViewProps = {
    interactive?: boolean;
    hasSignedUp?: boolean;
    rootStyle?: React.CSSProperties;
};
export function HomeLandingView({ interactive = true, hasSignedUp = false, rootStyle, }: HomeLandingViewProps) {
    const [browseOpportunityCount, setBrowseOpportunityCount] = useState<number | null>(null);
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
                setBrowseOpportunityCount(null);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const mainOverflow = interactive ? 'auto' : 'hidden';
    const opportunityCountLabel = browseOpportunityCount !== null
        ? browseOpportunityCount.toLocaleString('en-CA')
        : '—';
    return (<div style={{
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
          {interactive ? (<>
              <Link href={hasSignedUp ? '/auth?mode=signin' : '#'} className={`btn-signin ${!hasSignedUp ? 'btn-signin--disabled' : ''}`} onClick={(e) => !hasSignedUp && e.preventDefault()}>
                Sign in
              </Link>
              <Link href="/auth" className="btn-signup">
                Sign Up
              </Link>
            </>) : (<>
              <span className="btn-signin btn-signin--disabled">Sign in</span>
              <span className="btn-signup" style={{ pointerEvents: 'none' }}>
                Sign Up
              </span>
            </>)}
        </div>
      </nav>

      <main style={{
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
              <span style={{
            fontFamily: 'var(--font-display), Outfit, sans-serif',
            fontWeight: 700,
            fontSize: 44,
            lineHeight: '100%',
            color: '#0B0F1F',
            textAlign: 'center',
        }}>
                Find a Locum within 2 days,
              </span>
              <span style={{
            fontFamily: 'var(--font-display), Outfit, sans-serif',
            fontWeight: 700,
            fontSize: 44,
            lineHeight: '100%',
            color: '#0B0F1F',
            textAlign: 'center',
        }}>
                without agencies or endless calls
              </span>
            </div>

            <p style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 400,
            fontSize: 26,
            lineHeight: '132%',
            color: '#2A3050',
            textAlign: 'center',
            maxWidth: '100%',
            margin: 0,
        }}>
              Built for Nova Scotia physicians. Quickly connect with verified
              Locums or secure coverage for your clinic in minutes
            </p>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
        }}>
            {interactive ? (<>
                <Link href="/auth?role=clinic" className="btn-landing-cta">
                  Post a Locum Request
                </Link>
                <Link href="/locum/browse" className="btn-landing-cta">
                  Browse Locum Shifts
                </Link>
              </>) : (<>
                <span className="btn-landing-cta" style={{ pointerEvents: 'none' }}>
                  Post a Locum Request
                </span>
                <span className="btn-landing-cta" style={{ pointerEvents: 'none' }}>
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
                active Locum opportunities across
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
            padding: 0,
            gap: 24,
            marginTop: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '3px solid #F7F8FA',
            marginRight: -7,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 3,
            flexShrink: 0,
        }}>
                <Image src="/avatar-1.jpeg" alt="" fill sizes="56px" style={{ objectFit: 'cover' }}/>
              </div>
              <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '3px solid #F7F8FA',
            marginRight: -7,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 2,
            flexShrink: 0,
        }}>
                <Image src="/avatar-2.jpeg" alt="" fill sizes="56px" style={{ objectFit: 'cover' }}/>
              </div>
              <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#6B7280',
            border: '3px solid #F7F8FA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            position: 'relative',
            flexShrink: 0,
        }}>
                <span style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 400,
            fontSize: 18,
            color: '#FFFFFF',
        }}>
                  {opportunityCountLabel}
                </span>
              </div>
            </div>

            <span style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 400,
            fontSize: 18,
            color: '#606061',
            marginLeft: 5,
        }}>
              doctors covered shifts this month
            </span>
          </div>

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
        </footer>
      </main>

      {interactive ? (
        <Link href="/admin/login" className="home-admin-login-btn">
          Admin login
        </Link>
      ) : null}
    </div>);
}
