import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { router } from 'expo-router';
import { authApi } from '@/api/auth';
import { getAccessToken, setUnauthorizedHandler } from '@/api/client';
import { getErrorMessage } from '@/api/client';
import type { AuthMeResponse, UserRole } from '@/types/api';

type AuthContextValue = {
  user: AuthMeResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    role: Extract<UserRole, 'HOST' | 'LOCUM'>,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function homeRouteForRole(role: UserRole): string {
  if (role === 'HOST') return '/(host)/jobs';
  if (role === 'LOCUM') return '/(locum)/jobs';
  return '/login';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }
    const me = await authApi.getMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    router.replace('/login');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace('/login');
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshUser();
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password);
    const me = await authApi.getMe();
    setUser(me);
    router.replace(homeRouteForRole(me.role));
  }, []);

  const register = useCallback(
    async (email: string, password: string, role: Extract<UserRole, 'HOST' | 'LOCUM'>) => {
      await authApi.register(email, password, role);
      const me = await authApi.getMe();
      setUser(me);
      router.replace(homeRouteForRole(me.role));
    },
    [],
  );

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

export { getErrorMessage };
