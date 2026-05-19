'use client';

import type { ReactNode } from 'react';
import { AdminStatsProvider } from '@/components/AdminStatsContext';

export default function AdminRouteLayout({ children }: { children: ReactNode }) {
  return <AdminStatsProvider>{children}</AdminStatsProvider>;
}
