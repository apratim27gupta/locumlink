'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getRole, isProfileComplete, getEmail } from '@/lib/auth';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { HomeLandingView } from '@/components/HomeLandingView';

export default function HomePage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const router = useRouter();

  // ── FIX Issue 2: block the landing view until we know whether to redirect ─
  // Without this guard the component renders HomeLandingView for ~300–500 ms
  // (one React paint cycle) before the effect fires, causing the visible flash.
  const [isClient, setIsClient] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSignedUp, setHasSignedUp] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setHasSignedUp(Boolean(getEmail()));

    const token = getToken();

    if (!token) {
      // Not logged in — show the landing page immediately
      setAuthChecked(true);
      return;
    }

    // Logged in — redirect; never show the landing page to authenticated users
    const role = getRole();
    const done = isProfileComplete();

    const params = new URLSearchParams(window.location.search);
    const rawNext = params.get('next');
    const safeNext =
      rawNext &&
      rawNext.startsWith('/') &&
      !rawNext.startsWith('//') &&
      (rawNext.startsWith('/host') || rawNext.startsWith('/locum'))
        ? rawNext
        : null;

    if (!done) {
      router.replace(role === 'clinic' ? '/host/setup' : '/locum/setup');
      return; // don't setAuthChecked — component will unmount on redirect
    }

    if (safeNext) {
      router.replace(safeNext);
      return;
    }

    router.replace(role === 'clinic' ? '/host/dashboard' : '/locum/dashboard');
    // intentionally no setAuthChecked(true) here — redirect is in-flight
  }, [router]);

  // SSR and the first client paint must match — no `window` / token branching until mounted.
  if (!isClient) {
    return null;
  }

  // Logged-in users redirect away — show a light loading state instead of a blank screen.
  if (!authChecked) {
    if (getToken()) {
      return (
        <div className="flex min-h-[50vh] w-full items-center justify-center text-sm text-neutral-500">
          Loading…
        </div>
      );
    }
    return null;
  }

  return <HomeLandingView interactive hasSignedUp={hasSignedUp} />;
}
