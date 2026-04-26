'use client';
import { use } from 'react';
export function useNextPageClientProps(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): void {
    // Important: don't create fresh promises inside client components.
    // Next.js can treat that as "uncached promise" and suspend unexpectedly.
    if (props.params)
        use(props.params);
    if (props.searchParams)
        use(props.searchParams);
}
