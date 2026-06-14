import { apiClient, buildQueryString } from './client';
import type { NotificationsResponse, PaginationQuery } from '@/types/api';

export const notificationsApi = {
  async list(params?: PaginationQuery): Promise<NotificationsResponse> {
    const { data } = await apiClient.get<NotificationsResponse>(
      `/notifications${buildQueryString(params)}`,
    );
    return data;
  },

  async markRead(id: string): Promise<void> {
    await apiClient.patch(`/notifications/${encodeURIComponent(id)}/read`);
  },

  async markAllRead(): Promise<void> {
    await apiClient.patch('/notifications/read-all');
  },
};
