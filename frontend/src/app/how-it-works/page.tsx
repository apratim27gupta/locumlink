import { Suspense } from 'react';
import Link from 'next/link';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import HowToVideoCard from '@/components/HowToVideoCard';
import HowToHashScroll from '@/components/HowToHashScroll';
import { HOW_TO_VIDEOS } from '@/lib/howToVideos';

export default function HowItWorksPage() {
  return (
    <PublicPageShell showSignIn={false}>
      <div className="support-page support-page--wide">
        <HowToHashScroll />
        <Suspense fallback={null}>
          <PublicPageBackLink />
        </Suspense>
        <article className="support-card">
          <h1 className="support-page__title">How it works</h1>
          <p className="support-page__lead">
            Ten short demos for hosts and locums - posting, matching, fees, applications, and the
            pre-filled GP form. Videos stream from cloud storage and cache in the browser after the
            first play.
          </p>
          <p className="how-to-page__meta">
            <Link href="/news#release" className="support-text-link">
              What’s new in this release
            </Link>
            {' · '}
            <Link href="/resources" className="support-text-link">
              Resources
            </Link>
          </p>

          <nav className="how-it-works-page__jump" aria-label="Jump to demo">
            {HOW_TO_VIDEOS.map((video, index) => (
              <a
                key={video.id}
                href={`#${video.id}`}
                className="how-it-works-page__jump-link"
              >
                {String(index + 1).padStart(2, '0')}. {video.title}
              </a>
            ))}
          </nav>

          <div className="how-to-video-grid" style={{ marginTop: 28 }}>
            {HOW_TO_VIDEOS.map((video, index) => (
              <HowToVideoCard key={video.id} video={video} index={index} />
            ))}
          </div>
        </article>
      </div>
    </PublicPageShell>
  );
}
