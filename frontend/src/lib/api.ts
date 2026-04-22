import type { HostProfile, LocumProfile } from '@/types';
import type { Role } from '@/lib/auth';
import { getToken, clearSession, syncCookies } from '@/lib/auth';

const NEST_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

function networkFetchError(label: string, err: unknown): Error {
  const isProd = process.env.NODE_ENV === 'production';
  const baseHint =
    isProd && (!process.env.NEXT_PUBLIC_API_URL || /localhost/.test(NEST_BASE))
      ? ` (check Vercel env NEXT_PUBLIC_API_URL; current base is "${NEST_BASE}")`
      : ` (base: "${NEST_BASE}")`;
  const msg =
    err instanceof Error && err.message
      ? err.message
      : 'Failed to fetch (network error)';
  return new Error(`${label} failed: ${msg}${baseHint}`);
}

export class ApiHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

// ── 401 handler — re-sync cookies if token exists, else clear session ─────────
function handleUnauthorized(): void {
  if (typeof window === 'undefined') return;

  const token = getToken();

  if (token) {
    // Token exists in localStorage but cookie may have been missing
    // Re-sync cookies first — this fixes the middleware gap
    syncCookies();
    // Give syncCookies 100ms to write cookies, then redirect softly
    // so the next page load sees the cookie and middleware lets them through
    setTimeout(() => {
      window.location.href = '/auth';
    }, 100);
  } else {
    // Genuinely no token anywhere — clear everything and redirect
    clearSession();
    window.location.href = '/auth';
  }
}

function nestHeaders(json: boolean): HeadersInit {
  const token = getToken();
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export type UploadResult = {
  path: string;
  signedUrl: string;
  fileName: string;
  size: number;
  mimeType: string;
};

export async function uploadFile(
  file: File,
  folder?: string,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (folder) formData.append('folder', folder);

  const token = getToken();

  // ✅ FIX: use relative URL so it goes through Next.js proxy (avoids CORS)
  // Previously was: fetch(`${NEST_BASE}/api/upload`, ...) which hit NestJS directly
  const res = await fetch(`${NEST_BASE}/api/upload`, {
    // const res = await fetch(`/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw nestHttpError(text, res.status, 'Uploading file');
  }
  return res.json() as Promise<UploadResult>;
}

const DASHBOARD_LOAD_LABELS = new Set([
  'Loading jobs',
  'Loading dashboard stats',
]);

type NestHttpErrorOpts = {
  skipAuthRedirect?: boolean;
};

function nestHttpError(
  body: string,
  status: number,
  label: string,
  options?: NestHttpErrorOpts,
): Error {
  const trimmed = body.trim();
  let parsedMessage: string | null = null;
  try {
    const j = JSON.parse(trimmed) as { message?: string | string[] };
    const raw = j.message;
    const m = Array.isArray(raw) ? raw.join(', ') : raw;
    if (m && typeof m === 'string') parsedMessage = m;
  } catch {
    /* not JSON */
  }

  if (status === 401) {
    if (!options?.skipAuthRedirect) handleUnauthorized();
    return new ApiHttpError(parsedMessage || 'Unauthorized', 401);
  }

  const generic500 =
    status === 500 &&
    (!parsedMessage || /^internal server error$/i.test(parsedMessage.trim()));

  if (generic500) {
    if (DASHBOARD_LOAD_LABELS.has(label)) {
      return new Error(
        'Could not load dashboard (server error). Restart the API after `backend/.env.staging` and `frontend/.env.local` exist, run `npm run db:prepare`, then sign in again so your token matches `JWT_SECRET`.',
      );
    }
    return new Error(
      `${label} failed (server error). Ensure the API is running, DATABASE_URL is set, migrations are applied, then restart the backend.`,
    );
  }
  if (parsedMessage) return new Error(parsedMessage);
  return new Error(trimmed || `${label} failed (${status})`);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  syncFromSupabase: async (
    role: Role,
  ): Promise<{ accessToken: string; refreshToken: string }> => {
    const res = await fetch(`${NEST_BASE}/api/auth/sync-supabase`, {
      method: 'POST',
      headers: nestHeaders(true),
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `sync-supabase failed: ${res.status}`);
    }
    return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
  },
};

// ─── Locum ────────────────────────────────────────────────────────────────────

export type BrowseJobHostProfile = {
  practiceName: string;
  city: string;
  province: string;
  address: string | null;
  address1: string | null;
  practiceType: string | null;
  emr: string | null;
  servicesOffered: string[];
  highlights: string | null;
};

export type BrowseJob = {
  id: string;
  title: string;
  description: string;
  location: string;
  createdAt: string;
  applicationsCount: number;
  hostProfile: BrowseJobHostProfile;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  payPerDay: string | number | null;
  requiredCredentials: string[];
  keyResponsibilities: string[];
  minYearsExperience: number | null;
  isRural: boolean;
  accommodationProvided: boolean;
};

export type MyApplication = {
  id: string;
  status: 'APPLIED' | 'SHORTLISTED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN';
  appliedAt: string;
  coverNote?: string | null;
  jobPosting: {
    id: string;
    title: string;
    description: string;
    startDate: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    hostProfile: {
      userId: string;
      practiceName: string;
      city: string;
      province: string;
    };
  };
};

export const locumApi = {
  getProfile: async (): Promise<{
    exists: boolean;
    profile: LocumProfile | null;
  }> => {
    const res = await fetch(`${NEST_BASE}/api/locum/profile`, {
      cache: 'no-store',
      headers: nestHeaders(false),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading profile');
    }
    return res.json() as Promise<{
      exists: boolean;
      profile: LocumProfile | null;
    }>;
  },

  saveProfile: async (data: LocumProfile): Promise<unknown> => {
    const res = await fetch(`${NEST_BASE}/api/locum/profile`, {
      method: 'POST',
      headers: nestHeaders(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Saving profile');
    }
    return res.json();
  },

  browseJobs: async (): Promise<{ jobs: BrowseJob[] }> => {
    const res = await fetch(`${NEST_BASE}/api/locum/jobs`, {
      cache: 'no-store',
      headers: nestHeaders(false),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading jobs');
    }
    return res.json() as Promise<{ jobs: BrowseJob[] }>;
  },

  applyToJob: async (jobId: string, coverNote?: string): Promise<unknown> => {
    const res = await fetch(
      `${NEST_BASE}/api/locum/jobs/${encodeURIComponent(jobId)}/apply`,
      {
        method: 'POST',
        headers: nestHeaders(true),
        body: JSON.stringify(coverNote !== undefined ? { coverNote } : {}),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Applying to job');
    }
    return res.json();
  },

  getMyApplications: async (): Promise<{ applications: MyApplication[] }> => {
    const res = await fetch(`${NEST_BASE}/api/locum/applications`, {
      cache: 'no-store',
      headers: nestHeaders(false),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading applications');
    }
    return res.json() as Promise<{ applications: MyApplication[] }>;
  },
};

// ─── Host ─────────────────────────────────────────────────────────────────────

export type PostingStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED';

export type Job = {
  id: string;
  title: string;
  description: string;
  status: PostingStatus;
  applicationsCount: number;
  startDate?: string | null;
  endDate?: string | null;
  payPerDay?: string | number | null;
  location?: string;
  keyResponsibilities?: string[];
  isRural?: boolean;
  accommodationProvided?: boolean;
  expiresAt?: string | null;
  [key: string]: unknown;
};

export type LocumDocumentSnippet = {
  id: string;
  documentType: string;
  storageUrl: string;
  fileName: string;
};

export type ApplicationRecord = {
  id: string;
  status: 'APPLIED' | 'SHORTLISTED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN';
  locumProfile: {
    id: string;
    userId: string;
    firstName: string | null;
    lastName: string | null;
    cpsnsId: string;
    specialty: string;
    summary: string | null;
    yearsOfExperience: number | null;
    documents: LocumDocumentSnippet[];
    user: { email: string };
  };
};

export type DashboardStats = {
  totalJobsPosted: number;
  activeJobs: number;
  completedJobs: number;
  applications: number;
  comparisons: {
    totalJobsPosted: {
      change: number;
      direction: 'up' | 'down';
      period: string;
    };
    activeJobs: { change: number; direction: 'up' | 'down'; period: string };
    completedJobs: { change: number; direction: 'up' | 'down'; period: string };
    applications: { change: number; direction: 'up' | 'down'; period: string };
  };
};

export interface CreateJobPayload {
  title: string;
  description?: string;
  location?: string;
  expiresAt?: string;
  servicesRequired?: string[];
  isRural?: boolean;
  accommodationProvided?: boolean;
  keyResponsibilities?: string[];
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  payPerDay?: number;
  minYearsExperience?: number;
  maxApplicants?: number;
  travelRequired?: boolean;
  scheduleFlexible?: boolean;
  requiredCredentials?: string[];
  status?: 'ACTIVE' | 'DRAFT';
}

export const hostApi = {
  getProfile: async (): Promise<HostProfile | null> => {
    const res = await fetch(`/api/host/profile`, {
      cache: 'no-store',
      headers: nestHeaders(false),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading host profile');
    }
    return res.json() as Promise<HostProfile>;
  },

  saveProfile: async (data: HostProfile): Promise<HostProfile> => {
    const res = await fetch(`/api/host/profile`, {
      method: 'POST',
      headers: nestHeaders(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Saving host profile');
    }
    return res.json() as Promise<HostProfile>;
  },

  createJob: async (body: CreateJobPayload): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetch(`${NEST_BASE}/api/host/jobs`, {
        method: 'POST',
        headers: nestHeaders(true),
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw networkFetchError('Creating job', err);
    }
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Creating job');
    }
    return res.json();
  },

  getJobs: async (): Promise<{ jobs: Job[] }> => {
    let res: Response;
    try {
      res = await fetch(`${NEST_BASE}/api/host/jobs`, {
        cache: 'no-store',
        headers: nestHeaders(false),
      });
    } catch (err) {
      throw networkFetchError('Loading jobs', err);
    }
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading jobs');
    }
    return res.json() as Promise<{ jobs: Job[] }>;
  },

  getJob: async (jobId: string): Promise<{ job: Job }> => {
    let res: Response;
    try {
      res = await fetch(
        `${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}`,
        {
          cache: 'no-store',
          headers: nestHeaders(false),
        },
      );
    } catch (err) {
      throw networkFetchError('Loading job', err);
    }
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading job');
    }
    return res.json() as Promise<{ job: Job }>;
  },

  updateJob: async (jobId: string, body: Partial<CreateJobPayload>): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetch(
        `${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}`,
        {
          method: 'PATCH',
          headers: nestHeaders(true),
          body: JSON.stringify(body),
        },
      );
    } catch (err) {
      throw networkFetchError('Updating job', err);
    }
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Updating job');
    }
    return res.json();
  },

  getDashboardStats: async (): Promise<DashboardStats> => {
    let res: Response;
    try {
      res = await fetch(`${NEST_BASE}/api/host/stats`, {
        cache: 'no-store',
        headers: nestHeaders(false),
      });
    } catch (err) {
      throw networkFetchError('Loading dashboard stats', err);
    }
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading dashboard stats');
    }
    return res.json() as Promise<DashboardStats>;
  },

  getApplications: async (
    jobId: string,
  ): Promise<{ applications: ApplicationRecord[] }> => {
    let res: Response;
    try {
      res = await fetch(
        `${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}/applications`,
        { cache: 'no-store', headers: nestHeaders(false) },
      );
    } catch (err) {
      throw networkFetchError('Loading applications', err);
    }
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading applications');
    }
    return res.json() as Promise<{ applications: ApplicationRecord[] }>;
  },

  updateApplication: async (
    jobId: string,
    appId: string,
    status: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED',
  ): Promise<unknown> => {
    const res = await fetch(
      `${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}/applications/${encodeURIComponent(appId)}`,
      {
        method: 'PATCH',
        headers: nestHeaders(true),
        body: JSON.stringify({ status }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Updating application');
    }
    return res.json();
  },

  reopenJob: async (
    jobId: string,
    additionalApplicants: number,
  ): Promise<unknown> => {
    const res = await fetch(
      `${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}/reopen`,
      {
        method: 'POST',
        headers: nestHeaders(true),
        body: JSON.stringify({ additionalApplicants }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Reopening job');
    }
    return res.json();
  },
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export type ConversationPartner = {
  id: string;
  email: string;
  role: string;
  locumProfile: { firstName: string | null; lastName: string | null } | null;
  hostProfile: {
    contactFirstName: string | null;
    contactLastName: string | null;
    practiceName: string;
  } | null;
};

export type Conversation = {
  partnerId: string;
  partner: ConversationPartner;
  lastMessage: {
    id: string;
    body: string;
    sentAt: string;
    senderId: string;
    deletedAt: string | null;
    jobPosting: { id: string; title: string } | null;
  };
  unreadCount: number;
};

export type ThreadMessage = {
  id: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  senderId: string;
  sender: ConversationPartner;
};

export type ThreadPartner = ConversationPartner & {
  locumProfile: {
    firstName: string | null;
    lastName: string | null;
    specializationText: string | null;
    specialty: string;
    city: string | null;
    province: string | null;
  } | null;
  hostProfile: {
    contactFirstName: string | null;
    contactLastName: string | null;
    practiceName: string;
    city: string | null;
    province: string | null;
  } | null;
};

export const messageApi = {
  getConversations: async (): Promise<{ conversations: Conversation[] }> => {
    const res = await fetch(`${NEST_BASE}/api/messages/conversations`, {
      cache: 'no-store',
      headers: nestHeaders(false),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading conversations');
    }
    return res.json() as Promise<{ conversations: Conversation[] }>;
  },

  getThread: async (
    partnerId: string,
  ): Promise<{ messages: ThreadMessage[]; partner: ThreadPartner | null }> => {
    const res = await fetch(
      `${NEST_BASE}/api/messages/thread/${encodeURIComponent(partnerId)}`,
      { cache: 'no-store', headers: nestHeaders(false) },
    );
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading thread');
    }
    return res.json() as Promise<{
      messages: ThreadMessage[];
      partner: ThreadPartner | null;
    }>;
  },

  sendMessage: async (
    recipientId: string,
    body: string,
    jobPostingId?: string,
  ): Promise<{ message: ThreadMessage }> => {
    const res = await fetch(`${NEST_BASE}/api/messages`, {
      method: 'POST',
      headers: nestHeaders(true),
      body: JSON.stringify({
        recipientId,
        body,
        ...(jobPostingId ? { jobPostingId } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Sending message');
    }
    return res.json() as Promise<{ message: ThreadMessage }>;
  },

  editMessage: async (
    messageId: string,
    body: string,
  ): Promise<{ message: ThreadMessage }> => {
    const res = await fetch(
      `${NEST_BASE}/api/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PATCH',
        headers: nestHeaders(true),
        body: JSON.stringify({ body }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Editing message');
    }
    return res.json() as Promise<{ message: ThreadMessage }>;
  },

  deleteMessage: async (
    messageId: string,
  ): Promise<{ message: ThreadMessage }> => {
    const res = await fetch(
      `${NEST_BASE}/api/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'DELETE',
        headers: nestHeaders(false),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Deleting message');
    }
    return res.json() as Promise<{ message: ThreadMessage }>;
  },
};

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationItem = {
  id: string;
  type: 'message' | 'application' | 'shortlisted';
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

export type NotificationsResponse = {
  total: number;
  notifications: NotificationItem[];
};

export const notificationsApi = {
  get: async (): Promise<NotificationsResponse> => {
    const res = await fetch(`${NEST_BASE}/api/notifications`, {
      cache: 'no-store',
      headers: nestHeaders(false),
    });
    if (!res.ok) {
      const text = await res.text();
      throw nestHttpError(text, res.status, 'Loading notifications', {
        skipAuthRedirect: true,
      });
    }
    return res.json() as Promise<NotificationsResponse>;
  },
};
