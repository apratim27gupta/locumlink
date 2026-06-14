import { StyleSheet, Text, View } from 'react-native';

export function MessageBubble({
  body,
  sentAt,
  isMine,
}: {
  body: string;
  sentAt: string;
  isMine: boolean;
}) {
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>{body}</Text>
        <Text style={[styles.time, isMine ? styles.timeMine : styles.timeTheirs]}>
          {new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 4, paddingHorizontal: 12 },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#0F2A7A' },
  bubbleTheirs: { backgroundColor: '#f3f4f6' },
  text: { fontSize: 15, lineHeight: 20 },
  textMine: { color: '#fff' },
  textTheirs: { color: '#0f1523' },
  time: { fontSize: 10, marginTop: 4 },
  timeMine: { color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  timeTheirs: { color: '#9ca3af' },
});
