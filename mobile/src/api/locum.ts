import { apiClient, buildQueryString } from './client';
import type {
  BrowseJob,
  LocumProfile,
  MyApplication,
  PaginatedResult,
  PaginationQuery,
} from '@/types/api';

export const locumApi = {
  async getProfile(): Promise<{ exists: boolean; profile: LocumProfile | null }> {
    const { data } = await apiClient.get<{ exists: boolean; profile: LocumProfile | null }>(
      '/locum/profile',
    );
    return data;
  },

  async saveProfile(profile: LocumProfile): Promise<unknown> {
    const { data } = await apiClient.post('/locum/profile', profile);
    return data;
  },

  async browseJobs(params?: PaginationQuery): Promise<PaginatedResult<BrowseJob>> {
    const { data } = await apiClient.get<PaginatedResult<BrowseJob>>(
      `/locum/jobs${buildQueryString(params)}`,
    );
    return data;
  },

  async applyToJob(jobId: string, coverNote?: string): Promise<unknown> {
    const { data } = await apiClient.post(
      `/locum/jobs/${encodeURIComponent(jobId)}/apply`,
      coverNote !== undefined ? { coverNote } : {},
    );
    return data;
  },

  async getMyApplications(params?: PaginationQuery): Promise<PaginatedResult<MyApplication>> {
    const { data } = await apiClient.get<PaginatedResult<MyApplication>>(
      `/locum/applications${buildQueryString(params)}`,
    );
    return data;
  },

  async getStats(): Promise<{ totalAcceptedShifts: number; completedShifts: number }> {
    const { data } = await apiClient.get<{
      totalAcceptedShifts: number;
      completedShifts: number;
    }>('/locum/stats');
    return data;
  },

  async respondToPlacement(
    applicationId: string,
    response: 'accept' | 'decline',
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.patch<{ success: boolean }>(
      `/locum/applications/${encodeURIComponent(applicationId)}/respond`,
      { response },
    );
    return data;
  },
};
