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
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { buildNativeInjectScript, useExpoPush } from './useExpoPush';

const PRIMARY_COLOR = '#38C6C6';
const APP_ORIGIN = process.env.EXPO_PUBLIC_APP_URL ?? 'https://staging.locumlink.ca';

/** Must match `scheme` in app.json and frontend `nativeShell.ts` */
const NATIVE_OAUTH_SCHEME = 'calocumlinkapp';
const NATIVE_OAUTH_RETURN_URL = `${NATIVE_OAUTH_SCHEME}://auth/callback`;

const OAUTH_URL_PATTERNS = [
  'supabase.co/auth/v1/authorize',
  'accounts.google.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
];
// Email OTP never hits these — stays in WebView unaffected

function toWebOAuthCallbackUrl(resultUrl: string): string | null {
  try {
    const parsed = new URL(resultUrl);
    const origin = APP_ORIGIN.replace(/\/$/, '');
    const isNativeScheme = parsed.protocol === `${NATIVE_OAUTH_SCHEME}:`;
    const isAuthCallback =
      isNativeScheme || parsed.pathname === '/auth/callback';

    if (!isAuthCallback) return null;

    const code = parsed.searchParams.get('code');
    const role = parsed.searchParams.get('role');
    const error =
      parsed.searchParams.get('error_description')
      ?? parsed.searchParams.get('error');
    if (!code && !error) return null;

    if (
      !isNativeScheme
      && parsed.origin === new URL(origin).origin
      && parsed.pathname === '/auth/callback'
    ) {
      return parsed.toString();
    }

    const target = new URL('/auth/callback', origin);
    if (code) target.searchParams.set('code', code);
    if (role) target.searchParams.set('role', role);
    if (error) target.searchParams.set('error', error);
    return target.toString();
  } catch {
    /* ignore */
  }
  return null;
}

function resolveNotificationUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${APP_ORIGIN}${path}`;
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [hasError, setHasError] = useState(false);

  const navigateWebViewTo = useCallback((url: string) => {
    webViewRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(url)};`,
    );
  }, []);

  const handleOAuthReturnUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    const webCallback = toWebOAuthCallbackUrl(url);
    if (!webCallback) return;
    navigateWebViewTo(webCallback);
  }, [navigateWebViewTo]);

  const handleNotificationTap = useCallback((url: string | undefined) => {
    const target = resolveNotificationUrl(url);
    if (!target) return;
    navigateWebViewTo(target);
  }, [navigateWebViewTo]);

  const { pushToken } = useExpoPush(handleNotificationTap);

  const nativeInjectScript = useMemo(
    () => buildNativeInjectScript(Platform.OS, pushToken),
    [pushToken],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    WebBrowser.maybeCompleteAuthSession();
    void Linking.getInitialURL().then(handleOAuthReturnUrl);
    const sub = Linking.addEventListener('url', (event) => {
      handleOAuthReturnUrl(event.url);
    });
    return () => {
      sub.remove();
      void WebBrowser.coolDownAsync();
    };
  }, [handleOAuthReturnUrl]);

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
    if (Platform.OS === 'web') return true;

    const oauthCallback = toWebOAuthCallbackUrl(request.url);
    if (oauthCallback && oauthCallback !== request.url) {
      navigateWebViewTo(oauthCallback);
      return false;
    }

    const isOAuthUrl = OAUTH_URL_PATTERNS.some((p) => request.url.includes(p));
    if (isOAuthUrl) {
      void WebBrowser.openAuthSessionAsync(request.url, NATIVE_OAUTH_RETURN_URL)
        .then((result) => {
          if (result.type === 'success' && result.url) {
            handleOAuthReturnUrl(result.url);
          }
        })
        .catch(() => {});
      return false;
    }

    return true;
  }, [handleOAuthReturnUrl, navigateWebViewTo]);

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
