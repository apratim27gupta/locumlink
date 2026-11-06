import { Suspense } from 'react';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import PublicResourcesList from '@/components/PublicResourcesList';

export default function PublicResourcesPage() {
  return (
    <PublicPageShell>
      <div className="support-page support-page--wide">
        <Suspense fallback={null}>
          <PublicPageBackLink />
        </Suspense>
        <article className="support-card">
          <h1 className="support-page__title">Resources</h1>
          <p className="support-page__lead">
            Physician guides, Locum Program forms, and links hosts and locums use on LocumLink.
          </p>
          <PublicResourcesList />
        </article>
      </div>
    </PublicPageShell>
  );
}
