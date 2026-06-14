import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { getErrorMessage } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/api';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Extract<UserRole, 'LOCUM' | 'HOST'>>('LOCUM');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRegister() {
    setError(null);
    setBusy(true);
    try {
      await register(email.trim(), password, role);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.heading}>Create account</Text>
      <Text style={styles.sub}>Join Locum Link as a locum or clinic host</Text>

      <View style={styles.roleRow}>
        <Pressable
          style={[styles.roleBtn, role === 'LOCUM' && styles.roleBtnActive]}
          onPress={() => setRole('LOCUM')}
        >
          <Text style={[styles.roleText, role === 'LOCUM' && styles.roleTextActive]}>Locum</Text>
        </Pressable>
        <Pressable
          style={[styles.roleBtn, role === 'HOST' && styles.roleBtnActive]}
          onPress={() => setRole('HOST')}
        >
          <Text style={[styles.roleText, role === 'HOST' && styles.roleTextActive]}>Clinic host</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (8+ chars, mixed case, number, symbol)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.btn} onPress={handleRegister} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
      </Pressable>

      <Link href="/login" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f7f8fa' },
  heading: { fontSize: 24, fontWeight: '700', color: '#0f1523', marginBottom: 6 },
  sub: { fontSize: 14, color: '#5a6478', marginBottom: 20 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d0d4e4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleBtnActive: { borderColor: '#0F2A7A', backgroundColor: '#E8EDF8' },
  roleText: { fontSize: 14, fontWeight: '600', color: '#5a6478' },
  roleTextActive: { color: '#0F2A7A' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d0d4e4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: '#0F2A7A',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 8 },
  link: { marginTop: 20, textAlign: 'center', color: '#0F2A7A', fontSize: 14, fontWeight: '600' },
});
