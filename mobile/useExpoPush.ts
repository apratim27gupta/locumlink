import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

export function useExpoPush(onNotificationTap: (url: string | undefined) => void) {
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let responseSub: Notifications.EventSubscription | undefined;
    let cancelled = false;

    void (async () => {
      if (!Device.isDevice) return;

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted' || cancelled) return;

      const projectId = getExpoProjectId();
      if (!projectId) return;

      try {
        const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!cancelled) setPushToken(tokenResult.data);
      } catch {
        /* simulator or missing push credentials */
      }
    })();

    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      onNotificationTap(typeof url === 'string' ? url : undefined);
    });

    return () => {
      cancelled = true;
      responseSub?.remove();
    };
  }, [onNotificationTap]);

  return { pushToken };
}

import { APP_ORIGIN } from './oauthEnv';

export function buildNativeInjectScript(
  platform: string,
  pushToken: string | null,
): string {
  return `
    window.__LOCUMLINK_NATIVE__ = {
      platform: ${JSON.stringify(platform)},
      pushToken: ${JSON.stringify(pushToken)},
      appOrigin: ${JSON.stringify(APP_ORIGIN)},
    };
    window.dispatchEvent(new CustomEvent('ll-native-shell-update'));
    true;
  `;
}
