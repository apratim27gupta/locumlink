'use client';

import { useEffect } from 'react';
import { syncCookies } from '@/lib/auth';

export function AuthSync() {
  useEffect(() => {
    // Sync immediately on every page load / navigation
    syncCookies();

    // Re-sync when user returns to the tab (e.g. switched tabs then came back)
    function onFocus() {
      syncCookies();
    }

    // Re-sync when tab becomes visible (e.g. phone unlocked, alt-tab back)
    function onVisibility() {
      if (document.visibilityState === 'visible') syncCookies();
    }

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
