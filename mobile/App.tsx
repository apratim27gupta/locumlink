import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { buildNativeInjectScript, useExpoPush } from './useExpoPush';

const PRIMARY_COLOR = '#38C6C6';
const APP_ORIGIN = process.env.EXPO_PUBLIC_APP_URL ?? 'https://staging.locumlink.ca';

const OAUTH_URL_PATTERNS = [
  'supabase.co/auth/v1/authorize',
  'accounts.google.com',
  'login.microsoftonline.com',
];
// Email OTP never hits these — stays in WebView unaffected

function resolveNotificationUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${APP_ORIGIN}${path}`;
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [hasError, setHasError] = useState(false);

  const handleNotificationTap = useCallback((url: string | undefined) => {
    const target = resolveNotificationUrl(url);
    if (!target) return;
    webViewRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(target)};`,
    );
  }, []);

  const { pushToken } = useExpoPush(handleNotificationTap);

  const nativeInjectScript = useMemo(
    () => buildNativeInjectScript(Platform.OS, pushToken),
    [pushToken],
  );

  useEffect(() => {
    if (Platform.OS === 'web' || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(
      buildNativeInjectScript(Platform.OS, pushToken),
    );
  }, [pushToken]);

  function handleRetry() {
    setHasError(false);
    webViewRef.current?.reload();
  }

  const handleShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    const isOAuthUrl = OAUTH_URL_PATTERNS.some((p) => request.url.includes(p));
    if (isOAuthUrl && Platform.OS !== 'web') {
      WebBrowser.openAuthSessionAsync(request.url, APP_ORIGIN + '/auth/callback')
        .then((result) => {
          if (result.type === 'success' && result.url) {
            webViewRef.current?.injectJavaScript(
              `window.location.href = ${JSON.stringify(result.url)};`,
            );
          }
        })
        .catch(() => {});
      return false;
    }
    return true;
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {Platform.OS === 'web' ? (
          <View style={styles.webview}>
            <iframe
              src={APP_ORIGIN}
              title="Locum Link"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          </View>
        ) : (
          <View style={styles.webview}>
            <WebView
              ref={webViewRef}
              source={{ uri: APP_ORIGIN }}
              style={styles.webview}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              originWhitelist={['*']}
              allowsInlineMediaPlayback
              setSupportMultipleWindows={false}
              startInLoadingState
              injectedJavaScriptBeforeContentLoaded={nativeInjectScript}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={PRIMARY_COLOR} />
                </View>
              )}
              onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
              onError={() => setHasError(true)}
              onContentProcessDidTerminate={() => webViewRef.current?.reload()}
              onHttpError={(event) => {
                const { statusCode } = event.nativeEvent;
                if (statusCode >= 500) {
                  setHasError(true);
                }
              }}
            />
            {hasError ? (
              <View style={styles.errorOverlay}>
                <Text style={styles.errorMessage}>Could not load the app</Text>
                <Pressable style={styles.retryButton} onPress={handleRetry}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? { height: '100vh' as unknown as number } : {}),
  },
  webview: {
    flex: 1,
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as unknown as number } : {}),
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    gap: 16,
  },
  errorMessage: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
