import { useEffect } from 'react';
import { router } from 'expo-router';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/api';

function homeForRole(role: UserRole): string {
  if (role === 'HOST') return '/(host)/jobs';
  if (role === 'LOCUM') return '/(locum)/jobs';
  return '/login';
}

export default function Index() {
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    router.replace(homeForRole(user.role));
  }, [isLoading, isAuthenticated, user]);

  return <LoadingSpinner />;
}
