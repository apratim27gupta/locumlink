'use client';

import { Suspense, useState } from 'react';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import RequestDemoModal from '@/components/RequestDemoModal';
import { ABOUT_PAGE } from '@/content/about';

export default function AboutPage() {
  const { story, cta } = ABOUT_PAGE;
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <PublicPageShell showSignIn={false}>
      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      <div className="support-page support-page--wide">
        <Suspense fallback={null}>
          <PublicPageBackLink />
        </Suspense>
        <article className="support-card about-page">
          <section id="story" className="about-page__section about-page__section--with-photo about-page__section--first">
            <div className="about-page__story">
              <figure className="about-page__story-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={story.imageSrc}
                  alt={story.imageAlt}
                  width={480}
                  height={480}
                />
              </figure>
              <div className="about-page__story-copy">
                <h1 className="about-page__section-title about-page__story-title">
                  {story.title}
                </h1>
                <p className="about-page__body">{story.body}</p>
                <p className="about-page__attribution">
                  <span className="about-page__attribution-name">{story.attributionName}</span>
                  <span className="about-page__attribution-role">{story.attributionRole}</span>
                  {story.attributionLines.map((line) => (
                    <span key={line} className="about-page__attribution-line">
                      {line}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </section>

          <section id="request-demo" className="about-page__cta">
            <h2 className="about-page__section-title">{cta.title}</h2>
            <p className="about-page__body">{cta.body}</p>
            <div className="about-page__cta-row">
              <button
                type="button"
                className="about-page__cta-btn"
                onClick={() => setDemoOpen(true)}
              >
                {cta.primaryLabel}
              </button>
            </div>
          </section>
        </article>
      </div>
    </PublicPageShell>
  );
}
