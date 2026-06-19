'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getRole, isProfileComplete } from '@/lib/auth';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { HomeLandingView } from '@/components/HomeLandingView';
export default function HomePageClient(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
    initialActiveJobCount: number;
}) {
    const { initialActiveJobCount, ...pageProps } = props;
    useNextPageClientProps(pageProps);
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    useEffect(() => {
        setIsClient(true);
        const token = getToken();
        if (!token) {
            setAuthChecked(true);
            return;
        }
        const role = getRole();
        const done = isProfileComplete();
        const params = new URLSearchParams(window.location.search);
        const rawNext = params.get('next');
        const safeNext = rawNext &&
            rawNext.startsWith('/') &&
            !rawNext.startsWith('//') &&
            (rawNext.startsWith('/host') || rawNext.startsWith('/locum'))
            ? rawNext
            : null;
        const skipSetup = params.get('skipSetup') === '1';
        if (!done && !skipSetup) {
            router.replace(role === 'clinic' ? '/host/setup' : '/locum/setup');
            return;
        }
        if (skipSetup) {
            setAuthChecked(true);
            return;
        }
        if (safeNext) {
            router.replace(safeNext);
            return;
        }
        router.replace(role === 'clinic' ? '/host/dashboard' : '/locum/dashboard');
    }, [router]);
    if (!authChecked && isClient && getToken()) {
        return (<div className="flex min-h-[50vh] w-full items-center justify-center text-sm text-neutral-500">
          Loading…
        </div>);
    }
    if (authChecked || !isClient) {
        return (
            <HomeLandingView
                interactive={isClient}
                initialActiveJobCount={initialActiveJobCount}
            />
        );
    }
    return (<div className="flex min-h-[50vh] w-full items-center justify-center text-sm text-neutral-500">
      Loading…
    </div>);
}
