import { Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const URL = 'https://locumlink.ca';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS === 'web' ? (
        <View style={styles.webview}>
          <iframe
            src={URL}
            title="Locum Link"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        </View>
      ) : (
        <WebView
          source={{ uri: URL }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          originWhitelist={['*']}
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
        />
      )}
    </SafeAreaView>
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
});
