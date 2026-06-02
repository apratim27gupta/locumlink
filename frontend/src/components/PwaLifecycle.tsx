'use client';

import { useEffect, useState } from 'react';
import { dispatchPwaRefresh } from '@/lib/pwaEvents';

/**
 * PWA: detect service-worker updates, bridge push → in-app refresh, refetch on resume.
 */
export function PwaLifecycle() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LL_PWA_REFRESH') {
        dispatchPwaRefresh();
        return;
      }
      if (event.data?.type === 'LL_NAVIGATE' && typeof event.data.url === 'string') {
        const next = event.data.url;
        if (window.location.pathname + window.location.search !== next) {
          window.location.href = next;
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', onSwMessage);

    const onControllerChange = () => {
      setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | undefined;

    void navigator.serviceWorker.ready.then((reg) => {
      registration = reg;
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            setUpdateReady(true);
          }
        });
      });
      void reg.update();
    });

    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      dispatchPwaRefresh();
      void registration?.update();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);

    const updateInterval = window.setInterval(() => {
      void registration?.update();
    }, 60 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      );
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      window.clearInterval(updateInterval);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 420,
        margin: '0 auto',
        zIndex: 10000,
        padding: '12px 16px',
        borderRadius: 12,
        background: '#0F2A7A',
        color: '#fff',
        boxShadow: '0 8px 32px rgba(15,42,122,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 14,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <span>A new version is ready.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          flexShrink: 0,
          padding: '8px 14px',
          borderRadius: 8,
          border: 'none',
          background: '#38C6C6',
          color: '#0F2A7A',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Reload
      </button>
    </div>
  );
}
