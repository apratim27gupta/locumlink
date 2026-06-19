'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AdminAuthGate from '@/components/AdminAuthGate';
import { AdminStatsProvider } from '@/components/AdminStatsContext';
import { isAdminPublicPath } from '@/lib/admin-public-paths';

export default function AdminRouteLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Login must not sit behind AdminAuthGate — useSearchParams() there suspends
  // and can leave the PWA stuck on "Loading…" instead of the email form.
  if (isAdminPublicPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <Suspense
      fallback={
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
          Loading…
        </div>
      }
    >
      <AdminAuthGate>
        <AdminStatsProvider>{children}</AdminStatsProvider>
      </AdminAuthGate>
    </Suspense>
  );
}
