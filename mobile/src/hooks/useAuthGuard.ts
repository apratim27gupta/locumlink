import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/api';

function homeForRole(role: UserRole): string {
  if (role === 'HOST') return '/(host)/jobs';
  if (role === 'LOCUM') return '/(locum)/jobs';
  return '/login';
}

/**
 * Protects role-specific routes. Redirects unauthenticated users to login
 * and users with the wrong role to their correct home.
 */
export function useAuthGuard(expectedRole: Extract<UserRole, 'HOST' | 'LOCUM'>) {
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== expectedRole) {
      router.replace(homeForRole(user.role));
    }
  }, [isLoading, isAuthenticated, user, expectedRole]);

  return { user, isLoading, isReady: !isLoading && isAuthenticated && user?.role === expectedRole };
}
