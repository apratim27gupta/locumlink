import type { HostProfile, LocumProfile } from '@/types';
import type { Role } from '@/lib/auth';
import { getToken, clearSession, syncCookies } from '@/lib/auth';
import { startLoader, stopLoader } from '@/lib/topLoader';
const NEST_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '') || (typeof window === 'undefined' ? 'http://localhost:3000' : '');
function networkFetchError(label: string, err: unknown): Error {
    const isProd = process.env.NODE_ENV === 'production';
    const baseHint = NEST_BASE
        ? (isProd && (!process.env.NEXT_PUBLIC_API_URL || /localhost/.test(NEST_BASE))
            ? ` (check Vercel env NEXT_PUBLIC_API_URL; current base is "${NEST_BASE}")`
            : ` (base: "${NEST_BASE}")`)
        : ' (base: same-origin)';
    const msg = err instanceof Error && err.message
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
function handleUnauthorized(): void {
    if (typeof window === 'undefined')
        return;
    const token = getToken();
    if (token) {
        syncCookies();
        setTimeout(() => {
            window.location.href = '/auth';
        }, 100);
    }
    else {
        clearSession();
        window.location.href = '/auth';
    }
}
function nestHeaders(json: boolean): HeadersInit {
    const token = getToken();
    const h: Record<string, string> = {};
    if (json)
        h['Content-Type'] = 'application/json';
    if (token)
        h.Authorization = `Bearer ${token}`;
    return h;
}
type TrackedInit = RequestInit & {
    skipTopLoader?: boolean;
};
function trackedFetchInit(init?: TrackedInit): RequestInit {
    if (!init)
        return {};
    const { skipTopLoader: _skip, ...rest } = init;
    return rest;
}
async function trackedFetch(input: RequestInfo | URL, init?: TrackedInit): Promise<Response> {
    const skip = init?.skipTopLoader === true;
    const plain = trackedFetchInit(init);
    if (typeof window === 'undefined' || skip) {
        return fetch(input, plain);
    }
    startLoader();
    try {
        return await fetch(input, plain);
    }
    finally {
        stopLoader();
    }
}
export type UploadResult = {
    path: string;
    signedUrl: string;
    fileName: string;
    size: number;
    mimeType: string;
};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const BROWSER_API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');
export async function uploadFile(file: File, folder?: string): Promise<UploadResult> {
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('File must be 10 MB or smaller.');
    }
    if (file.type && !ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
        throw new Error('Only PDF, JPG, PNG, WEBP, GIF, DOC, or DOCX files are allowed.');
    }
    const formData = new FormData();
    formData.append('file', file);
    if (folder)
        formData.append('folder', folder);
    const token = getToken();
    const uploadBase = BROWSER_API_BASE || NEST_BASE;
    const res = await trackedFetch(`${uploadBase}/api/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        skipTopLoader: true,
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
function nestHttpError(body: string, status: number, label: string, options?: NestHttpErrorOpts): Error {
    const trimmed = body.trim();
    let parsedMessage: string | null = null;
    try {
        const j = JSON.parse(trimmed) as {
            message?: string | string[];
        };
        const raw = j.message;
        const m = Array.isArray(raw) ? raw.join(', ') : raw;
        if (m && typeof m === 'string')
            parsedMessage = m;
    }
    catch {
    }
    if (status === 401) {
        if (!options?.skipAuthRedirect)
            handleUnauthorized();
        return new ApiHttpError(parsedMessage || 'Unauthorized', 401);
    }
    const generic500 = status === 500 &&
        (!parsedMessage || /^internal server error$/i.test(parsedMessage.trim()));
    if (generic500) {
        if (DASHBOARD_LOAD_LABELS.has(label)) {
            return new Error('Could not load dashboard (server error). Restart the API after `backend/.env.staging` and `frontend/.env.local` exist, run `npm run db:prepare`, then sign in again so your token matches `JWT_SECRET`.');
        }
        return new Error(`${label} failed (server error). Ensure the API is running, DATABASE_URL is set, migrations are applied, then restart the backend.`);
    }
    if (parsedMessage)
        return new Error(parsedMessage);
    return new Error(trimmed || `${label} failed (${status})`);
}
export type AuthMeResponse = {
    id: string;
    email: string;
    role: string;
    avatarUrl: string | null;
    status?: string;
    emailVerified?: boolean;
    createdAt?: string;
    updatedAt?: string;
};
export const authApi = {
    devOtpLogin: async (email: string, role: Role): Promise<{
        accessToken: string;
        refreshToken: string;
    }> => {
        const authBase = BROWSER_API_BASE || NEST_BASE;
        const res = await trackedFetch(`${authBase}/api/auth/dev-otp-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `dev-otp-login failed: ${res.status}`);
        }
        return res.json() as Promise<{
            accessToken: string;
            refreshToken: string;
        }>;
    },
    syncFromSupabase: async (role: Role): Promise<{
        accessToken: string;
        refreshToken: string;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/auth/sync-supabase`, {
            method: 'POST',
            headers: nestHeaders(true),
            body: JSON.stringify({ role }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `sync-supabase failed: ${res.status}`);
        }
        return res.json() as Promise<{
            accessToken: string;
            refreshToken: string;
        }>;
    },
    getMe: async (): Promise<AuthMeResponse> => {
        const res = await trackedFetch(`${NEST_BASE}/api/auth/me`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `auth/me failed: ${res.status}`);
        }
        return res.json() as Promise<AuthMeResponse>;
    },
    updateAvatar: async (storagePath: string): Promise<void> => {
        const res = await trackedFetch(`${NEST_BASE}/api/auth/me/avatar`, {
            method: 'PATCH',
            headers: nestHeaders(true),
            body: JSON.stringify({ storagePath }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Could not save profile photo (${res.status})`);
        }
    },
    clearAvatar: async (): Promise<void> => {
        const res = await trackedFetch(`${NEST_BASE}/api/auth/me/avatar`, {
            method: 'DELETE',
            headers: nestHeaders(true),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Could not remove profile photo (${res.status})`);
        }
    },
    deactivateAccount: async (): Promise<void> => {
        const res = await trackedFetch(`${NEST_BASE}/api/auth/me/deactivate`, {
            method: 'POST',
            headers: nestHeaders(true),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Could not deactivate account (${res.status})`);
        }
    },
};
export type BrowseJobHostProfile = {
    practiceName: string;
    city: string;
    province: string;
    postalCode?: string;
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
    locumResponse: 'ACCEPTED' | 'REJECTED' | null;
    appliedAt: string;
    coverNote?: string | null;
    locumAcceptedAt?: string | null;
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
export const landingApi = {
    getRecentHostAvatars: async (): Promise<{
        avatars: string[];
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/public/recent-host-avatars`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading host avatars');
        }
        return res.json() as Promise<{
            avatars: string[];
        }>;
    },
};

export const locumApi = {
    getProfile: async (): Promise<{
        exists: boolean;
        profile: LocumProfile | null;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/profile`, {
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
        const res = await trackedFetch(`${NEST_BASE}/api/locum/profile`, {
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
    getBrowseOpportunitiesCount: async (): Promise<{
        count: number;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/jobs/browse-count`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading opportunity count');
        }
        return res.json() as Promise<{
            count: number;
        }>;
    },
    browseJobs: async (): Promise<{
        jobs: BrowseJob[];
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/jobs`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading jobs');
        }
        return res.json() as Promise<{
            jobs: BrowseJob[];
        }>;
    },
    applyToJob: async (jobId: string, coverNote?: string): Promise<unknown> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/jobs/${encodeURIComponent(jobId)}/apply`, {
            method: 'POST',
            headers: nestHeaders(true),
            body: JSON.stringify(coverNote !== undefined ? { coverNote } : {}),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Applying to job');
        }
        return res.json();
    },
    getMyApplications: async (): Promise<{
        applications: MyApplication[];
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/applications`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading applications');
        }
        return res.json() as Promise<{
            applications: MyApplication[];
        }>;
    },
    respondToConfirmedPlacement: async (applicationId: string, response: 'accept' | 'decline'): Promise<{
        success: boolean;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/applications/${encodeURIComponent(applicationId)}/respond`, {
            method: 'PATCH',
            headers: nestHeaders(true),
            body: JSON.stringify({ response }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Updating application');
        }
        return res.json() as Promise<{ success: boolean }>;
    },
};
export type PostingStatus = 'DRAFT' | 'ACTIVE' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type Job = {
    id: string;
    title: string;
    description: string;
    status: PostingStatus;
    isDeleted?: boolean;
    applicationsCount: number;
    maxApplicants?: number;
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
function normalizePostingStatus(value: unknown): PostingStatus {
    const s = String(value ?? 'DRAFT').toUpperCase();
    if (s === 'ACTIVE' || s === 'ONGOING' || s === 'COMPLETED' || s === 'CANCELLED' || s === 'EXPIRED')
        return s;
    return 'DRAFT';
}
export function normalizeHostJob(raw: unknown): Job {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const count = r.applicationsCount ?? (r._count as {
        applications?: number;
    } | undefined)?.applications;
    return {
        ...r,
        id: String(r.id ?? ''),
        title: String(r.title ?? ''),
        description: String(r.description ?? ''),
        status: normalizePostingStatus(r.status),
        applicationsCount: typeof count === 'number' ? count : Number(count ?? 0),
        payPerDay: r.payPerDay != null ? Number(r.payPerDay) : null,
    } as Job;
}
export function isActiveJob(job: Job): boolean {
    return job.status === 'ACTIVE' || job.status === 'ONGOING';
}
export function isDraftJob(job: Job): boolean {
    return job.status === 'DRAFT';
}
export type LocumDocumentSnippet = {
    id: string;
    documentType: string;
    storageUrl: string;
    fileName: string;
};
export type ApplicationRecord = {
    id: string;
    status: 'APPLIED' | 'SHORTLISTED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN';
    locumResponse: 'ACCEPTED' | 'REJECTED' | null;
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
        user: {
            email: string;
        };
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
        activeJobs: {
            change: number;
            direction: 'up' | 'down';
            period: string;
        };
        completedJobs: {
            change: number;
            direction: 'up' | 'down';
            period: string;
        };
        applications: {
            change: number;
            direction: 'up' | 'down';
            period: string;
        };
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
    /** When true, always persists as DRAFT (draft locum shift), even if host is CPSNS-verified. */
    saveAsDraft?: boolean;
}
function mapRawToHostProfile(raw: Record<string, unknown>): HostProfile {
    return {
        clinicName: String(raw.clinicName ?? raw.practiceName ?? ''),
        contactFirstName: String(raw.contactFirstName ?? ''),
        contactLastName: String(raw.contactLastName ?? ''),
        cpsnsNumber: String(raw.cpsnsNumber ?? ''),
        cpsnsVerificationStatus: raw.cpsnsVerificationStatus as HostProfile['cpsnsVerificationStatus'],
        rejectionReason: (raw.rejectionReason as string | null | undefined) ?? null,
        rejectedAt: (raw.rejectedAt as string | null | undefined) ?? null,
        accountStatus: raw.accountStatus as HostProfile['accountStatus'],
        suspensionNote: (raw.suspensionNote as string | null | undefined) ?? null,
        suspendedAt: (raw.suspendedAt as string | null | undefined) ?? null,
        speciality: String(raw.speciality ?? ''),
        licenseFile: (raw.licenseFile as string | null | undefined) ?? null,
        licenseOriginalName: (raw.licenseOriginalName as string | null | undefined) ?? null,
        address1: String(raw.address1 ?? ''),
        address2: String(raw.address2 ?? ''),
        postalCode: String(raw.postalCode ?? ''),
        city: String(raw.city ?? ''),
        province: String(raw.province ?? ''),
        amenities: Array.isArray(raw.servicesOffered)
            ? (raw.servicesOffered as string[])
            : Array.isArray(raw.amenities)
                ? (raw.amenities as string[])
                : [],
        accommodationProvided: Boolean(raw.accommodationProvided),
        practiceType: String(raw.practiceType ?? ''),
        numPhysicians: String(raw.numPhysicians ?? ''),
        emr: String(raw.emr ?? ''),
        patientVol: String(raw.patientVol ?? ''),
        clinicDesc: String(raw.clinicDesc ?? raw.highlights ?? '').slice(0, 1000),
    };
}
function parseHostProfileResponse(data: unknown): HostProfile | null {
    if (data == null || typeof data !== 'object')
        return null;
    const wrapped = data as { exists?: boolean; profile?: unknown };
    if (wrapped.exists === false)
        return null;
    const raw = ((wrapped.profile ?? data) as Record<string, unknown>);
    return mapRawToHostProfile(raw);
}
export const hostApi = {
    getProfile: async (): Promise<HostProfile | null> => {
        const res = await trackedFetch(`${NEST_BASE}/api/host/profile`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (res.status === 404)
            return null;
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading host profile');
        }
        const data = await res.json();
        return parseHostProfileResponse(data);
    },
    saveProfile: async (data: HostProfile): Promise<HostProfile> => {
        const res = await trackedFetch(`${NEST_BASE}/api/host/profile`, {
            method: 'POST',
            headers: nestHeaders(true),
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Saving host profile');
        }
        const resData = await res.json();
        const saved = parseHostProfileResponse(resData);
        if (!saved)
            throw new Error('Saving host profile failed: empty response');
        return saved;
    },
    createJob: async (body: CreateJobPayload): Promise<{
        success: boolean;
        job: Job;
    }> => {
        let res: Response;
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/jobs`, {
                method: 'POST',
                headers: nestHeaders(true),
                body: JSON.stringify(body),
            });
        }
        catch (err) {
            throw networkFetchError('Creating job', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Creating job');
        }
        const data = await res.json() as {
            success?: boolean;
            job?: unknown;
        };
        if (!data.job)
            throw new Error('Creating job failed: empty response');
        return { success: data.success ?? true, job: normalizeHostJob(data.job) };
    },
    getJobs: async (opts?: { deleted?: boolean }): Promise<{
        jobs: Job[];
    }> => {
        let res: Response;
        const qs = opts?.deleted ? '?deleted=true' : '';
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/jobs${qs}`, {
                cache: 'no-store',
                headers: nestHeaders(false),
            });
        }
        catch (err) {
            throw networkFetchError('Loading jobs', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading jobs');
        }
        const data = await res.json() as {
            jobs?: unknown[];
        };
        return {
            jobs: (data.jobs ?? []).map((j) => normalizeHostJob(j)),
        };
    },
    getJob: async (jobId: string): Promise<{
        job: Job;
    }> => {
        let res: Response;
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}`, {
                cache: 'no-store',
                headers: nestHeaders(false),
            });
        }
        catch (err) {
            throw networkFetchError('Loading job', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading job');
        }
        return res.json() as Promise<{
            job: Job;
        }>;
    },
    updateJob: async (jobId: string, body: Partial<CreateJobPayload>): Promise<unknown> => {
        let res: Response;
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}`, {
                method: 'PATCH',
                headers: nestHeaders(true),
                body: JSON.stringify(body),
            });
        }
        catch (err) {
            throw networkFetchError('Updating job', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Updating job');
        }
        return res.json();
    },
    deleteJob: async (jobId: string): Promise<void> => {
        let res: Response;
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}`, {
                method: 'DELETE',
                headers: nestHeaders(false),
            });
        }
        catch (err) {
            throw networkFetchError('Deleting job', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Deleting job');
        }
    },
    getDashboardStats: async (): Promise<DashboardStats> => {
        let res: Response;
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/stats`, {
                cache: 'no-store',
                headers: nestHeaders(false),
            });
        }
        catch (err) {
            throw networkFetchError('Loading dashboard stats', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading dashboard stats');
        }
        return res.json() as Promise<DashboardStats>;
    },
    getApplications: async (jobId: string): Promise<{
        applications: ApplicationRecord[];
    }> => {
        let res: Response;
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}/applications`, { cache: 'no-store', headers: nestHeaders(false) });
        }
        catch (err) {
            throw networkFetchError('Loading applications', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading applications');
        }
        return res.json() as Promise<{
            applications: ApplicationRecord[];
        }>;
    },
    updateApplication: async (jobId: string, appId: string, status: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED'): Promise<unknown> => {
        const res = await trackedFetch(`${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}/applications/${encodeURIComponent(appId)}`, {
            method: 'PATCH',
            headers: nestHeaders(true),
            body: JSON.stringify({ status }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Updating application');
        }
        return res.json();
    },
    reopenJob: async (jobId: string, payload: {
        additionalApplicants: number;
        startDate?: string;
        endDate?: string;
    }): Promise<unknown> => {
        const res = await trackedFetch(`${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}/reopen`, {
            method: 'POST',
            headers: nestHeaders(true),
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Reopening job');
        }
        return res.json();
    },
};
export type ConversationPartner = {
    id: string;
    email: string;
    role: string;
    locumProfile: {
        firstName: string | null;
        lastName: string | null;
    } | null;
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
        jobPosting: {
            id: string;
            title: string;
        } | null;
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
    attachments?: {
        id: string;
        storagePath: string;
        fileName: string;
        mimeType: string;
        size: number;
        signedUrl?: string;
        createdAt: string;
    }[];
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
    getConversations: async (opts?: {
        skipTopLoader?: boolean;
        q?: string;
    }): Promise<{
        conversations: Conversation[];
    }> => {
        const q = opts?.q?.trim();
        const qs = q ? `?${new URLSearchParams({ q }).toString()}` : '';
        const res = await trackedFetch(`${NEST_BASE}/api/messages/conversations${qs}`, {
            cache: 'no-store',
            headers: nestHeaders(false),
            skipTopLoader: opts?.skipTopLoader ?? false,
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading conversations');
        }
        return res.json() as Promise<{
            conversations: Conversation[];
        }>;
    },
    getThread: async (partnerId: string, opts?: {
        skipTopLoader?: boolean;
        /** ISO timestamp — poll only messages newer than this (lighter on RAM/CPU). */
        since?: string;
    }): Promise<{
        messages: ThreadMessage[];
        partner: ThreadPartner | null;
    }> => {
        const qs = opts?.since ? `?${new URLSearchParams({ since: opts.since }).toString()}` : '';
        const res = await trackedFetch(`${NEST_BASE}/api/messages/thread/${encodeURIComponent(partnerId)}${qs}`, {
            cache: 'no-store',
            headers: nestHeaders(false),
            skipTopLoader: opts?.skipTopLoader ?? false,
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading thread');
        }
        return res.json() as Promise<{
            messages: ThreadMessage[];
            partner: ThreadPartner | null;
        }>;
    },
    sendMessage: async (recipientId: string, body: string, jobPostingId?: string, attachments?: {
        storagePath: string;
        fileName: string;
        mimeType: string;
        size: number;
    }[]): Promise<{
        message: ThreadMessage;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/messages`, {
            method: 'POST',
            headers: nestHeaders(true),
            body: JSON.stringify({
                recipientId,
                body,
                ...(jobPostingId ? { jobPostingId } : {}),
                ...(attachments?.length ? { attachments } : {}),
            }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Sending message');
        }
        return res.json() as Promise<{
            message: ThreadMessage;
        }>;
    },
    editMessage: async (messageId: string, body: string): Promise<{
        message: ThreadMessage;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/messages/${encodeURIComponent(messageId)}`, {
            method: 'PATCH',
            headers: nestHeaders(true),
            body: JSON.stringify({ body }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Editing message');
        }
        return res.json() as Promise<{
            message: ThreadMessage;
        }>;
    },
    deleteMessage: async (messageId: string): Promise<{
        message: ThreadMessage;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/messages/${encodeURIComponent(messageId)}`, {
            method: 'DELETE',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Deleting message');
        }
        return res.json() as Promise<{
            message: ThreadMessage;
        }>;
    },
};
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
    get: async (opts?: {
        skipTopLoader?: boolean;
    }): Promise<NotificationsResponse> => {
        const res = await trackedFetch(`${NEST_BASE}/api/notifications`, {
            cache: 'no-store',
            headers: nestHeaders(false),
            skipTopLoader: opts?.skipTopLoader ?? false,
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