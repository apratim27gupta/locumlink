import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ApplicationRecord, MyApplication } from '@/types/api';

type AppLike = MyApplication | ApplicationRecord;

function displayName(app: AppLike): string {
  if ('jobPosting' in app) return app.jobPosting.title;
  const p = app.locumProfile;
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.user.email;
}

export function ApplicationCard({ app, onPress }: { app: AppLike; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} disabled={!onPress}>
      <Text style={styles.title}>{displayName(app)}</Text>
      <View style={styles.row}>
        <Text style={styles.badge}>{app.status}</Text>
        {'locumResponse' in app && app.locumResponse ? (
          <Text style={styles.meta}>Response: {app.locumResponse}</Text>
        ) : null}
      </View>
      {'appliedAt' in app ? (
        <Text style={styles.meta}>Applied {new Date(app.appliedAt).toLocaleDateString()}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e5ee',
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '600', color: '#0f1523', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F2A7A',
    backgroundColor: '#E8EDF8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  meta: { fontSize: 12, color: '#5a6478' },
});
