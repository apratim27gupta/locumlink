import { Suspense } from 'react';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import NewsUpdatesPage from '@/components/NewsUpdatesPage';

export default function NewsPage() {
  return (
    <PublicPageShell>
      <div className="support-page support-page--wide">
        <Suspense fallback={null}>
          <PublicPageBackLink />
        </Suspense>
        <article className="support-card">
          <h1 className="support-page__title">News &amp; updates</h1>
          
          <NewsUpdatesPage />
        </article>
      </div>
    </PublicPageShell>
  );
}
