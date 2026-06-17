import { useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';
import { getToken } from '@/lib/auth';

const STORAGE_KEY_TO_TOUR: Record<string, 'host' | 'locum'> = {
    hasSeenHostTour: 'host',
    hasSeenLocumTour: 'locum',
};

function readTourSeenLocal(key: string): boolean {
    try {
        if (localStorage.getItem(key)) return true;
        if (key === 'hasSeenLocumTour' && localStorage.getItem('hasSeenTour')) {
            return true;
        }
    } catch {
        /* private mode / blocked storage */
    }
    return false;
}

function writeTourSeenLocal(key: string): void {
    try {
        localStorage.setItem(key, 'true');
    } catch {
        /* private mode / blocked storage */
    }
}

function hasSeenTourOnServer(
    me: { hasSeenHostTour?: boolean; hasSeenLocumTour?: boolean },
    tourKey: 'host' | 'locum',
): boolean {
    return tourKey === 'host'
        ? Boolean(me.hasSeenHostTour)
        : Boolean(me.hasSeenLocumTour);
}

export function useFirstVisit(key = 'hasSeenTour') {
    const [isFirstVisit, setIsFirstVisit] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const tourKey = STORAGE_KEY_TO_TOUR[key] ?? null;

    useEffect(() => {
        let cancelled = false;

        async function loadTourStatus() {
            if (readTourSeenLocal(key)) {
                if (!cancelled) {
                    setIsFirstVisit(false);
                    setIsLoading(false);
                }
                return;
            }

            if (!tourKey || !getToken()) {
                if (!cancelled) {
                    setIsFirstVisit(!readTourSeenLocal(key));
                    setIsLoading(false);
                }
                return;
            }

            try {
                const me = await authApi.getMe();
                const seen = hasSeenTourOnServer(me, tourKey);
                if (seen) {
                    writeTourSeenLocal(key);
                }
                if (!cancelled) {
                    setIsFirstVisit(!seen);
                }
            } catch {
                if (!cancelled) {
                    setIsFirstVisit(!readTourSeenLocal(key));
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        setIsLoading(true);
        void loadTourStatus();

        return () => {
            cancelled = true;
        };
    }, [key, tourKey]);

    const markAsSeen = useCallback(() => {
        writeTourSeenLocal(key);
        setIsFirstVisit(false);

        if (tourKey && getToken()) {
            void authApi.markTourSeen(tourKey).catch(() => {
                /* local cache already set as fallback */
            });
        }
    }, [key, tourKey]);

    return { isFirstVisit, isLoading, markAsSeen };
}
