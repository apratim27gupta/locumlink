'use client';

import { Suspense } from 'react';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import { ABOUT_PAGE } from '@/content/about';

export default function AboutPage() {
  const { story } = ABOUT_PAGE;

  return (
    <PublicPageShell showSignIn>
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
        </article>
      </div>
    </PublicPageShell>
  );
}
