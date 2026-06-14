import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

export default function HostProfileScreen() {
  const { user } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.sub}>{user?.email}</Text>
      <Text style={styles.sub}>Clinic profile edit form coming next.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f7f8fa' },
  title: { fontSize: 20, fontWeight: '700', color: '#0f1523' },
  sub: { fontSize: 14, color: '#5a6478', marginTop: 8 },
});
