import { apiClient, setTokens, clearTokens } from './client';
import type { AuthMeResponse, AuthTokens, UserRole } from '@/types/api';

export const authApi = {
  async login(email: string, password: string): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>('/auth/login', { email, password });
    await setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  async register(
    email: string,
    password: string,
    role: Extract<UserRole, 'HOST' | 'LOCUM'>,
    consentGiven = true,
  ): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>('/auth/register', {
      email,
      password,
      role,
      consentGiven,
      consentVersion: '1.0',
    });
    await setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  async getMe(): Promise<AuthMeResponse> {
    const { data } = await apiClient.get<AuthMeResponse>('/auth/me');
    return data;
  },

  async logout(): Promise<void> {
    await clearTokens();
  },

  async deactivateAccount(): Promise<void> {
    await apiClient.post('/auth/me/deactivate');
  },

  async permanentDeleteAccount(): Promise<void> {
    await apiClient.delete('/auth/me/permanent-delete');
  },
};
