import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function LoadingSpinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size={size} color="#0F2A7A" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
