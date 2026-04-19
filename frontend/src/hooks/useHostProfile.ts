import { useEffect, useState, useCallback } from 'react';
import type { HostProfile } from '@/types';
import { hostApi } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useAuth } from '@/providers/AuthProvider';

export function useHostProfile() {
  const { isLoading: authLoading, userId } = useAuth();
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const token = getToken();
    if (!token) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    hostApi
      .getProfile()
      .then((data) => {
        if (!cancelled) setProfile(data ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg =
            typeof err?.message === 'string' ? err.message : 'Failed to fetch profile';
          setError(msg);
          setProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const saveProfile = useCallback(async (data: HostProfile) => {
    setSaving(true);
    setError(null);

    try {
      const saved = await hostApi.saveProfile(data);
      setProfile(saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { profile, loading, saving, error, saveProfile };
}
