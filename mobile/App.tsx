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
import {
  APP_ORIGIN,
  getOAuthBrowserReturnUrl,
  isForeignOAuthCallbackUrl,
  isOAuthStartUrl,
  toWebOAuthCallbackUrl,
} from './oauthEnv';

const PRIMARY_COLOR = '#38C6C6';

function resolveNotificationUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${APP_ORIGIN}${path}`;
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const oauthInFlightRef = useRef(false);
  const [hasError, setHasError] = useState(false);

  const navigateWebViewTo = useCallback((url: string) => {
    webViewRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(url)};`,
    );
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

    void WebBrowser.openAuthSessionAsync(url, getOAuthBrowserReturnUrl())
      .then((result) => {
        oauthInFlightRef.current = false;
        if (result.type === 'success' && result.url) {
          handleOAuthReturnUrl(result.url);
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
      }
      return true;
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
              setSupportMultipleWindows={false}
              startInLoadingState
              injectedJavaScriptBeforeContentLoaded={nativeInjectScript}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={PRIMARY_COLOR} />
                </View>
              )}
              onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
              onNavigationStateChange={handleNavigationStateChange}
              onMessage={handleWebViewMessage}
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
