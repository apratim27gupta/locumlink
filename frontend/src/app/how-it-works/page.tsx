import { Suspense } from 'react';
import Link from 'next/link';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import HowToVideoCard from '@/components/HowToVideoCard';
import HowToHashScroll from '@/components/HowToHashScroll';
import { HOW_TO_VIDEOS } from '@/lib/howToVideos';

export default function HowItWorksPage() {
  const hostVideos = HOW_TO_VIDEOS.filter((v) => v.audience === 'Host' || v.audience === 'Both');
  const locumVideos = HOW_TO_VIDEOS.filter((v) => v.audience === 'Locum' || v.audience === 'Both');

  return (
    <PublicPageShell>
      <div className="support-page support-page--wide support-page--how-it-works">
        <HowToHashScroll />
        <Suspense fallback={null}>
          <PublicPageBackLink />
        </Suspense>
        <article className="support-card">
          <h1 className="support-page__title">How it works</h1>
          <p className="support-page__lead">
            Short demos for hosts and locums aligned with this release.
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

          <div className="how-it-works-page__columns">
            <section className="how-it-works-page__column" aria-labelledby="how-host-demos">
              <div className="how-it-works-page__column-head">
                <h2 id="how-host-demos" className="how-it-works-page__column-title">
                  For hosts
                </h2>
                <p className="how-it-works-page__column-intro">
                  Posting coverage, matching locums, fees, and MSI paperwork.
                </p>
                <nav
                  className="how-it-works-page__jump how-it-works-page__jump--two-col"
                  aria-label="Host demos"
                >
                  {hostVideos.map((video, index) => (
                    <a
                      key={video.id}
                      href={`#${video.id}`}
                      className="how-it-works-page__jump-link"
                    >
                      {String(index + 1).padStart(2, '0')}. {video.title}
                    </a>
                  ))}
                </nav>
              </div>
              <div className="how-to-video-grid">
                {hostVideos.map((video, index) => (
                  <HowToVideoCard key={video.id} video={video} index={index} />
                ))}
              </div>
            </section>

            <section className="how-it-works-page__column" aria-labelledby="how-locum-demos">
              <div className="how-it-works-page__column-head">
                <h2 id="how-locum-demos" className="how-it-works-page__column-title">
                  For locums
                </h2>
                <p className="how-it-works-page__column-intro">
                  Applying flexibly, updating availability, and withdrawing.
                </p>
                <nav className="how-it-works-page__jump" aria-label="Locum demos">
                  {locumVideos.map((video, index) => (
                    <a
                      key={video.id}
                      href={`#${video.id}`}
                      className="how-it-works-page__jump-link"
                    >
                      {String(index + 1).padStart(2, '0')}. {video.title}
                    </a>
                  ))}
                </nav>
              </div>
              <div className="how-to-video-grid">
                {locumVideos.map((video, index) => (
                  <HowToVideoCard key={video.id} video={video} index={index} />
                ))}
              </div>
            </section>
          </div>
        </article>
      </div>
    </PublicPageShell>
  );
}
