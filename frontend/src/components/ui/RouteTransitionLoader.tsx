'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { resetLoader, startLoader } from '@/lib/topLoader';
export default function RouteTransitionLoader() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isFirst = useRef(true);
    useEffect(() => {
        if (isFirst.current) {
            isFirst.current = false;
            return;
        }
        resetLoader();
    }, [pathname, searchParams]);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (e.button !== 0)
                return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                return;
            const a = (e.target as Element)?.closest('a[href]') as HTMLAnchorElement;
            if (!a)
                return;
            if (a.target === '_blank')
                return;
            if (a.hasAttribute('download'))
                return;
            let url: URL;
            try {
                url = new URL(a.href, location.origin);
            }
            catch {
                return;
            }
            if (url.origin !== location.origin)
                return;
            if (url.pathname === location.pathname &&
                url.search === location.search)
                return;
            startLoader();
        };
        document.addEventListener('click', handler, true);
        return () => document.removeEventListener('click', handler, true);
    }, []);
    return null;
}
