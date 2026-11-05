import { Suspense } from 'react';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import FaqAccordion from '@/components/FaqAccordion';

export default function PublicFaqPage() {
  return (
    <PublicPageShell showSignIn={false}>
      <div className="support-page support-page--wide">
        <Suspense fallback={null}>
          <PublicPageBackLink />
        </Suspense>
        <article className="support-card">
          <h1 className="support-page__title">FAQs</h1>
          <p className="support-page__lead">
            Answers for hosts and locums using LocumLink in Nova Scotia.
          </p>
          <FaqAccordion />
        </article>
      </div>
    </PublicPageShell>
  );
}
