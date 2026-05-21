'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getRole, isProfileComplete } from '@/lib/auth';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { HomeLandingView } from '@/components/HomeLandingView';
import { beforeClientNavigation } from '@/lib/topLoader';
export default function HomePage(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
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
            const href = role === 'clinic' ? '/host/setup' : '/locum/setup';
            beforeClientNavigation(href);
            router.replace(href);
            return;
        }
        if (skipSetup) {
            // User exited setup — stay on home, don't redirect anywhere
            setAuthChecked(true);
            return;
        }
        if (safeNext) {
            beforeClientNavigation(safeNext);
            router.replace(safeNext);
            return;
        }
        const dash = role === 'clinic' ? '/host/dashboard' : '/locum/dashboard';
        beforeClientNavigation(dash);
        router.replace(dash);
    }, [router]);
    if (!isClient) {
        return null;
    }
    if (!authChecked) {
        if (getToken()) {
            return (<div className="flex min-h-[50vh] w-full items-center justify-center text-sm text-neutral-500">
          Loading…
        </div>);
        }
        return null;
    }
    return <HomeLandingView interactive />;
}
