import { apiClient, buildQueryString } from './client';
import type {
  ApplicationRecord,
  CreateJobPayload,
  DashboardStats,
  HostProfile,
  Job,
  PaginatedResult,
  PaginationQuery,
  PostingStatus,
} from '@/types/api';

function normalizeJob(raw: Record<string, unknown>): Job {
  const count =
    raw.applicationsCount ??
    (raw._count as { applications?: number } | undefined)?.applications;
  const status = String(raw.status ?? 'DRAFT').toUpperCase() as PostingStatus;
  return {
    ...raw,
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    status,
    applicationsCount: typeof count === 'number' ? count : Number(count ?? 0),
    hasAcceptedLocum: raw.hasAcceptedLocum === true,
    payPerDay: raw.payPerDay != null ? Number(raw.payPerDay) : null,
  } as Job;
}

export const hostApi = {
  async getProfile(): Promise<HostProfile | null> {
    try {
      const { data } = await apiClient.get('/host/profile');
      if (data && typeof data === 'object' && 'exists' in data && data.exists === false) {
        return null;
      }
      const raw = (data as { profile?: HostProfile }).profile ?? data;
      return raw as HostProfile;
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 404
      ) {
        return null;
      }
      throw err;
    }
  },

  async saveProfile(profile: HostProfile): Promise<HostProfile> {
    const { data } = await apiClient.post('/host/profile', profile);
    const raw = (data as { profile?: HostProfile }).profile ?? data;
    return raw as HostProfile;
  },

  async getJobs(params?: PaginationQuery): Promise<PaginatedResult<Job>> {
    const qs = buildQueryString({
      ...params,
      ...(params?.deleted ? { deleted: 'true' } : {}),
    });
    const { data } = await apiClient.get<PaginatedResult<Record<string, unknown>>>(
      `/host/jobs${qs}`,
    );
    return {
      ...data,
      items: (data.items ?? []).map((j) => normalizeJob(j)),
    };
  },

  async getJob(id: string): Promise<Job> {
    const { data } = await apiClient.get<{ job: Record<string, unknown> }>(
      `/host/jobs/${encodeURIComponent(id)}`,
    );
    return normalizeJob(data.job);
  },

  async createJob(body: CreateJobPayload): Promise<{ success: boolean; job: Job }> {
    const { data } = await apiClient.post<{ success?: boolean; job: Record<string, unknown> }>(
      '/host/jobs',
      body,
    );
    return { success: data.success ?? true, job: normalizeJob(data.job) };
  },

  async updateJob(id: string, body: Partial<CreateJobPayload>): Promise<Job> {
    const { data } = await apiClient.patch<Record<string, unknown>>(
      `/host/jobs/${encodeURIComponent(id)}`,
      body,
    );
    return normalizeJob(data);
  },

  async deleteJob(id: string): Promise<void> {
    await apiClient.delete(`/host/jobs/${encodeURIComponent(id)}`);
  },

  async getApplications(
    jobId: string,
    params?: PaginationQuery,
  ): Promise<PaginatedResult<ApplicationRecord>> {
    const { data } = await apiClient.get<PaginatedResult<ApplicationRecord>>(
      `/host/jobs/${encodeURIComponent(jobId)}/applications${buildQueryString(params)}`,
    );
    return data;
  },

  async updateApplication(
    jobId: string,
    appId: string,
    status: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED',
  ): Promise<unknown> {
    const { data } = await apiClient.patch(
      `/host/jobs/${encodeURIComponent(jobId)}/applications/${encodeURIComponent(appId)}`,
      { status },
    );
    return data;
  },

  async getStats(): Promise<DashboardStats> {
    const { data } = await apiClient.get<DashboardStats>('/host/stats');
    return data;
  },
};
