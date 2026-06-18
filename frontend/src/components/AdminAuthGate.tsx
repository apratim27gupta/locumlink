'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { adminApiBase } from '@/lib/adminApi';
import { isAdminPublicPath } from '@/lib/admin-public-paths';

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(() => isAdminPublicPath(pathname));

  useEffect(() => {
    if (isAdminPublicPath(pathname)) {
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const res = await fetch(`${adminApiBase()}/api/admin-auth/me`, {
          credentials: 'include',
        });
        if (cancelled) return;
        if (res.ok) {
          setReady(true);
          return;
        }
      } catch {
        /* redirect below */
      }

      const qs = searchParams.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '40vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6B7280',
          fontSize: 14,
        }}
      >
        Checking admin session…
      </div>
    );
  }

  return <>{children}</>;
}
