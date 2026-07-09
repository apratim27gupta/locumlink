'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { notificationsApi } from '@/lib/api';
import {
  getNativePlatform,
  getNativePushToken,
  isNativeShell,
} from '@/lib/nativeShell';

/**
 * Registers the Expo push token with the backend when running inside the native app shell.
 */
export function NativePushBridge() {
  const { userId } = useAuth();
  const registeredTokenRef = useRef<string | null>(null);

  const syncToken = useCallback(() => {
    if (!isNativeShell()) return;

    const token = getNativePushToken();
    const platform = getNativePlatform();

    if (userId && token && platform) {
      if (registeredTokenRef.current === token) return;
      registeredTokenRef.current = token;
      void notificationsApi.registerExpoToken(token, platform).catch(() => {});
      return;
    }

    if (!userId && registeredTokenRef.current) {
      const previous = registeredTokenRef.current;
      registeredTokenRef.current = null;
      void notificationsApi.unregisterExpoToken(previous).catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    syncToken();
  }, [syncToken]);

  useEffect(() => {
    if (!isNativeShell()) return;

    const onNativeUpdate = () => {
      syncToken();
    };

    window.addEventListener('ll-native-shell-update', onNativeUpdate);
    return () => {
      window.removeEventListener('ll-native-shell-update', onNativeUpdate);
    };
  }, [syncToken]);

  return null;
}
