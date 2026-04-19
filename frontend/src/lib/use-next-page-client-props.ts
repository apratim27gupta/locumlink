'use client';

import { use } from 'react';

/**
 * Next.js 15 passes `params` and `searchParams` as Promises to Client page components.
 * They must be unwrapped with `React.use()` before any sync access (including devtools
 * enumerating props). Call at the top of each `'use client'` page default export.
 */
export function useNextPageClientProps(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): void {
  use(props.params ?? Promise.resolve({}));
  use(props.searchParams ?? Promise.resolve({}));
}
