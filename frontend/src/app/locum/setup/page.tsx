'use client';

import dynamic from 'next/dynamic';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

/** Client-only: avoids hydration mismatch when extensions inject attrs (e.g. fdprocessedid) on inputs. */
const LocumSetupPage = dynamic(() => import('./locum-profile-setup'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#F1F3F7',
      }}
      aria-hidden
    />
  ),
});

export default function LocumSetupRoute(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  return <LocumSetupPage />;
}
