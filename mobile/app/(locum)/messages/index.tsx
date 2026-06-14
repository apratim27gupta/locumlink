import { StyleSheet, Text, View } from 'react-native';

export default function LocumMessagesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Messages</Text>
      <Text style={styles.sub}>Conversations list coming next.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f7f8fa' },
  title: { fontSize: 20, fontWeight: '700', color: '#0f1523' },
  sub: { fontSize: 14, color: '#5a6478', marginTop: 8 },
});
