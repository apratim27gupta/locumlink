import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { buildNativeInjectScript, useExpoPush } from './useExpoPush';
import {
  APP_ORIGIN,
  NATIVE_OAUTH_RETURN_URL,
  isForeignOAuthCallbackUrl,
  isOAuthStartUrl,
  toWebOAuthCallbackUrl,
} from './oauthEnv';
import {
  CLEAR_PWA_STORAGE_SCRIPT,
  MAX_WEBVIEW_RECOVERY_ATTEMPTS,
} from './webViewRecovery';

const PRIMARY_COLOR = '#38C6C6';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

/**
 * Expo Go: redirect OAuth straight back to exp:// so the Custom Tab never
 * loads staging (PKCE verifier stays in the WebView).
 */
function getExpoGoOAuthReturnUrl(): string {
  return Linking.createURL('/auth/callback');
}

function getBrowserReturnUrl(): string {
  if (IS_EXPO_GO) return getExpoGoOAuthReturnUrl();
  return NATIVE_OAUTH_RETURN_URL;
}

function rewriteOAuthUrlForExpoGo(url: string): string {
  if (!IS_EXPO_GO) return url;
  try {
    const parsed = new URL(url);
    const redirectTo = parsed.searchParams.get('redirect_to');
    if (!redirectTo) return url;
    const role = new URL(redirectTo).searchParams.get('role') ?? 'locum';
    const expoReturn = Linking.createURL('/auth/callback', {
      queryParams: { role },
    });
    parsed.searchParams.set('redirect_to', expoReturn);
    return parsed.toString();
  } catch {
    return url;
  }
}

function resolveNotificationUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${APP_ORIGIN}${path}`;
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const oauthInFlightRef = useRef(false);
  const recoveryAttemptsRef = useRef(0);
  const [hasError, setHasError] = useState(false);

  const clearWebViewCache = useCallback(() => {
    webViewRef.current?.clearCache?.(true);
  }, []);

  const attemptWebViewRecovery = useCallback((injectPwaClear = false) => {
    const webView = webViewRef.current;
    if (!webView) return;

    recoveryAttemptsRef.current += 1;
    setHasError(false);
    clearWebViewCache();

    if (injectPwaClear) {
      webView.injectJavaScript(CLEAR_PWA_STORAGE_SCRIPT);
      return;
    }

    webView.reload();
  }, [clearWebViewCache]);

  const handleWebViewFailure = useCallback(() => {
    if (recoveryAttemptsRef.current < MAX_WEBVIEW_RECOVERY_ATTEMPTS) {
      attemptWebViewRecovery(recoveryAttemptsRef.current > 0);
      return;
    }
    setHasError(true);
  }, [attemptWebViewRecovery]);

  const navigateWebViewTo = useCallback((url: string) => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(
        `window.location.replace(${JSON.stringify(url)}); true;`,
      );
    }
  }, []);

  const handleOAuthReturnUrl = useCallback((url: string | null | undefined) => {
    oauthInFlightRef.current = false;
    if (!url) return;
    const webCallback = toWebOAuthCallbackUrl(url);
    if (!webCallback) return;
    navigateWebViewTo(webCallback);
  }, [navigateWebViewTo]);

  const openOAuthInBrowser = useCallback((url: string) => {
    if (oauthInFlightRef.current) return;
    oauthInFlightRef.current = true;

    const authUrl = rewriteOAuthUrlForExpoGo(url);
    const browserOptions =
      Platform.OS === 'android' ? { createTask: false } : undefined;

    void WebBrowser.openAuthSessionAsync(
      authUrl,
      getBrowserReturnUrl(),
      browserOptions,
    )
      .then((result) => {
        oauthInFlightRef.current = false;
        if (result.type === 'success' && result.url) {
          handleOAuthReturnUrl(result.url);
          return;
        }
        if (result.type === 'dismiss' || result.type === 'cancel') {
          void Linking.getInitialURL().then(handleOAuthReturnUrl);
        }
      })
      .catch(() => {
        oauthInFlightRef.current = false;
      });
  }, [handleOAuthReturnUrl]);

  const handleNotificationTap = useCallback((url: string | undefined) => {
    const target = resolveNotificationUrl(url);
    if (!target) return;
    navigateWebViewTo(target);
  }, [navigateWebViewTo]);

  const { pushToken, syncPushToken } = useExpoPush(handleNotificationTap);

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

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (hasError) {
        attemptWebViewRecovery(true);
      }
    });

    return () => sub.remove();
  }, [attemptWebViewRecovery, hasError]);

  const handleWebViewLoadEnd = useCallback(() => {
    if (Platform.OS === 'web' || !webViewRef.current) return;
    recoveryAttemptsRef.current = 0;
    setHasError(false);
    webViewRef.current.injectJavaScript(
      buildNativeInjectScript(Platform.OS, pushToken),
    );
    void syncPushToken();
  }, [pushToken, syncPushToken]);

  function handleRetry() {
    recoveryAttemptsRef.current = 0;
    setHasError(false);
    clearWebViewCache();
    webViewRef.current?.injectJavaScript(CLEAR_PWA_STORAGE_SCRIPT);
    webViewRef.current?.reload();
  }

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type?: string; url?: string };
      if (msg.type === 'oauth' && typeof msg.url === 'string') {
        openOAuthInBrowser(msg.url);
      }
    } catch {
      /* ignore */
    }
  }, [openOAuthInBrowser]);

  const interceptOAuthNavigation = useCallback((url: string): boolean => {
    if (Platform.OS === 'web') return false;

    const oauthCallback = toWebOAuthCallbackUrl(url);
    if (oauthCallback) {
      if (oauthCallback !== url) {
        navigateWebViewTo(oauthCallback);
        return true;
      }
      // Allow the WebView to load the callback URL (PKCE exchange happens here).
      return false;
    }

    if (isForeignOAuthCallbackUrl(url)) {
      return true;
    }

    if (isOAuthStartUrl(url)) {
      openOAuthInBrowser(url);
      return true;
    }

    return false;
  }, [navigateWebViewTo, openOAuthInBrowser]);

  const handleShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    return !interceptOAuthNavigation(request.url);
  }, [interceptOAuthNavigation]);

  const handleNavigationStateChange = useCallback((navState: { url: string }) => {
    if (interceptOAuthNavigation(navState.url)) {
      webViewRef.current?.stopLoading();
    }
  }, [interceptOAuthNavigation]);

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
              mediaCapturePermissionGrantType={
                Platform.OS === 'ios' ? 'grant' : undefined
              }
              setSupportMultipleWindows={false}
              startInLoadingState
              applicationNameForUserAgent="LocumLinkNative"
              injectedJavaScriptBeforeContentLoaded={nativeInjectScript}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={PRIMARY_COLOR} />
                </View>
              )}
              onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
              onNavigationStateChange={handleNavigationStateChange}
              onLoadEnd={handleWebViewLoadEnd}
              onMessage={handleWebViewMessage}
              onError={handleWebViewFailure}
              onContentProcessDidTerminate={() => {
                setHasError(false);
                clearWebViewCache();
                webViewRef.current?.reload();
              }}
              onHttpError={(event) => {
                const { statusCode } = event.nativeEvent;
                if (statusCode >= 500) {
                  handleWebViewFailure();
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
