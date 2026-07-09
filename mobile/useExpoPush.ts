import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { APP_ORIGIN } from './oauthEnv';

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

/** Request notification permission and return an Expo push token when available. */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = getExpoProjectId();
  if (!projectId) return null;

  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenResult.data;
  } catch {
    return null;
  }
}

export function useExpoPush(onNotificationTap: (url: string | undefined) => void) {
  const [pushToken, setPushToken] = useState<string | null>(null);

  const syncPushToken = useCallback(async () => {
    const token = await registerForPushNotifications();
    if (token) setPushToken(token);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let responseSub: Notifications.EventSubscription | undefined;
    let cancelled = false;

    void syncPushToken();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) void syncPushToken();
    });

    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      onNotificationTap(typeof url === 'string' ? url : undefined);
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      responseSub?.remove();
    };
  }, [onNotificationTap, syncPushToken]);

  return { pushToken, syncPushToken };
}

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
