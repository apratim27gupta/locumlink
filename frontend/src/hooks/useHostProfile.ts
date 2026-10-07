import { useEffect, useState, useCallback, useRef } from 'react';
import type { HostProfile } from '@/types';
import { hostApi } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { dispatchProfileUpdated, subscribeProfileUpdated } from '@/lib/profileUpdatedEvent';
import { useAuth } from '@/providers/AuthProvider';
export function useHostProfile() {
    const { isLoading: authLoading, userId } = useAuth();
    const [profile, setProfile] = useState<HostProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** After a local save we already have the response - skip the echo refresh. */
    const skipNextProfileEventRefresh = useRef(false);

    const refreshProfile = useCallback(async () => {
        const token = getToken();
        if (!token) {
            setProfile(null);
            setError(null);
            setLoading(false);
            return;
        }
        try {
            const data = await hostApi.getProfile();
            setProfile(data ?? null);
            setError(null);
        }
        catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to fetch profile';
            setError(msg);
            setProfile(null);
        }
    }, []);

    useEffect(() => {
        if (authLoading)
            return;
        const token = getToken();
        if (!token) {
            setProfile(null);
            setError(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        void refreshProfile().finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [authLoading, userId, refreshProfile]);

    useEffect(() => {
        return subscribeProfileUpdated(() => {
            if (skipNextProfileEventRefresh.current) {
                skipNextProfileEventRefresh.current = false;
                return;
            }
            void refreshProfile();
        });
    }, [refreshProfile]);

    const saveProfile = useCallback(async (data: HostProfile) => {
        setSaving(true);
        setError(null);
        try {
            const saved = await hostApi.saveProfile(data);
            setProfile(saved);
            skipNextProfileEventRefresh.current = true;
            dispatchProfileUpdated();
        }
        catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Save failed');
            throw err;
        }
        finally {
            setSaving(false);
        }
    }, []);
    return { profile, loading, saving, error, saveProfile };
}
