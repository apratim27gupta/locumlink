import { apiClient, buildQueryString } from './client';
import type {
  Conversation,
  PaginatedResult,
  PaginationQuery,
  ThreadMessage,
  ThreadPartner,
} from '@/types/api';

export const messagesApi = {
  async getConversations(q?: string): Promise<{ conversations: Conversation[] }> {
    const qs = q?.trim() ? buildQueryString({ q: q.trim() }) : '';
    const { data } = await apiClient.get<{ conversations: Conversation[] }>(
      `/messages/conversations${qs}`,
    );
    return data;
  },

  async getThread(
    partnerId: string,
    params?: PaginationQuery,
  ): Promise<PaginatedResult<ThreadMessage> & { partner: ThreadPartner | null }> {
    const { data } = await apiClient.get<
      PaginatedResult<ThreadMessage> & { partner: ThreadPartner | null }
    >(`/messages/thread/${encodeURIComponent(partnerId)}${buildQueryString(params)}`);
    return data;
  },

  async sendMessage(
    recipientId: string,
    body: string,
    jobPostingId?: string,
  ): Promise<{ message: ThreadMessage }> {
    const { data } = await apiClient.post<{ message: ThreadMessage }>('/messages', {
      recipientId,
      body,
      ...(jobPostingId ? { jobPostingId } : {}),
    });
    return data;
  },

  async editMessage(messageId: string, body: string): Promise<{ message: ThreadMessage }> {
    const { data } = await apiClient.patch<{ message: ThreadMessage }>(
      `/messages/${encodeURIComponent(messageId)}`,
      { body },
    );
    return data;
  },

  async deleteMessage(messageId: string): Promise<{ message: ThreadMessage }> {
    const { data } = await apiClient.delete<{ message: ThreadMessage }>(
      `/messages/${encodeURIComponent(messageId)}`,
    );
    return data;
  },
};
