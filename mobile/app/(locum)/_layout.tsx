import { Tabs } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function LocumLayout() {
  const { isReady } = useAuthGuard('LOCUM');
  const { logout } = useAuth();

  if (!isReady) return <LoadingSpinner />;

  return (
    <Tabs
      screenOptions={{
        headerRight: () => (
          <Pressable onPress={() => logout()} style={{ marginRight: 12 }}>
            <Text style={{ color: '#0F2A7A', fontWeight: '600' }}>Logout</Text>
          </Pressable>
        ),
        tabBarActiveTintColor: '#0F2A7A',
      }}
    >
      <Tabs.Screen name="jobs/index" options={{ title: 'Jobs', tabBarLabel: 'Browse' }} />
      <Tabs.Screen name="applications" options={{ title: 'Applications' }} />
      <Tabs.Screen name="messages/index" options={{ title: 'Messages' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="jobs/[id]" options={{ href: null, title: 'Job detail' }} />
      <Tabs.Screen name="messages/[partnerId]" options={{ href: null, title: 'Chat' }} />
    </Tabs>
  );
}
