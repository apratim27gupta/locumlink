'use client';

/**
 * useTrackLastPath
 *
 * Drop this hook into DashLayout.tsx (or any persistent layout that wraps
 * /host/* and /locum/* routes).  It records the current pathname into
 * ll_last_path in localStorage on every navigation so that after the next
 * OTP sign-in the user is sent straight back to where they were.
 *
 * Usage in DashLayout.tsx:
 *   import { useTrackLastPath } from '@/hooks/useTrackLastPath';
 *   export default function DashLayout(...) {
 *     useTrackLastPath();
 *     ...
 *   }
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { saveLastPath } from '@/lib/auth';

export function useTrackLastPath(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // saveLastPath already ignores /, /auth/*, /home/* paths
    saveLastPath(pathname);
  }, [pathname]);
}
