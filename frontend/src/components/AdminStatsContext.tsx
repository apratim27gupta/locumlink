'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { adminFetchJson } from '@/lib/adminApi';
import { normalizeAdminStats, type AdminStats } from '@/lib/adminStats';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';
import { onPwaRefresh } from '@/lib/pwaEvents';
import { isAdminPublicPath } from '@/lib/admin-public-paths';

export type { AdminStats };

type AdminStatsContextValue = {
  stats: AdminStats | null;
  adminEmail: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AdminStatsContext = createContext<AdminStatsContextValue | null>(null);

export function AdminStatsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = isAdminPublicPath(pathname);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<{
        admin?: { email?: string };
        stats?: unknown;
      }>('/api/admin/stats');
      if (data.admin?.email) setAdminEmail(data.admin.email);
      else setAdminEmail('');
      setStats(normalizeAdminStats(data.stats));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load admin stats';
      setError(
        msg === 'Unauthorized' || msg.includes('401')
          ? 'Not signed in or session expired. Sign in again at /admin/login.'
          : msg,
      );
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPublic) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, isPublic]);

  useVisibilityPolling(() => {
    void refresh();
  }, 30_000, !isPublic);

  useEffect(() => {
    if (isPublic) return;
    return onPwaRefresh(() => {
      void refresh();
    });
  }, [refresh, isPublic]);

  const value = useMemo(
    () => ({ stats, adminEmail, loading, error, refresh }),
    [stats, adminEmail, loading, error, refresh],
  );

  return (
    <AdminStatsContext.Provider value={value}>{children}</AdminStatsContext.Provider>
  );
}

export function useAdminStats(): AdminStatsContextValue {
  const ctx = useContext(AdminStatsContext);
  if (!ctx)
    throw new Error('useAdminStats must be used within AdminStatsProvider');
  return ctx;
}
