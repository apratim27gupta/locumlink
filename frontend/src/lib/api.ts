import type { HostProfile, LocumProfile } from '@/types';
import type { Role } from '@/lib/auth';
import { getToken, clearSession, syncCookies } from '@/lib/auth';
import { startLoader, stopLoader } from '@/lib/topLoader';
/** Server: direct Nest URL. Browser: same-origin `/api/*` via Next rewrites (avoids CORS). */
const NEST_BASE =
    typeof window === 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
        : '';
function networkFetchError(label: string, err: unknown): Error {
    const isProd = process.env.NODE_ENV === 'production';
    const baseHint = NEST_BASE
        ? (isProd && (!process.env.NEXT_PUBLIC_API_URL || /localhost/.test(NEST_BASE))
            ? ` (check Vercel env NEXT_PUBLIC_API_URL; current base is "${NEST_BASE}")`
            : ` (base: "${NEST_BASE}")`)
        : ' (via same-origin /api proxy — ensure the API on port 3000 is running)';
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

export type PaginatedResult<T> = {
    items: T[];
    nextCursor: string | null;
    hasNextPage: boolean;
    total?: number;
};

export type PaginationQuery = {
    cursor?: string;
    limit?: number;
    direction?: 'asc' | 'desc';
    status?: string;
    unreadOnly?: boolean;
};

function buildPaginationQs(params?: PaginationQuery & Record<string, string | number | boolean | undefined>): string {
    if (!params)
        return '';
    const sp = new URLSearchParams();
    if (params.cursor)
        sp.set('cursor', params.cursor);
    if (params.limit != null)
        sp.set('limit', String(params.limit));
    if (params.direction)
        sp.set('direction', params.direction);
    if (params.status)
        sp.set('status', params.status);
    if (params.unreadOnly)
        sp.set('unreadOnly', 'true');
    for (const [key, value] of Object.entries(params)) {
        if (['cursor', 'limit', 'direction', 'status', 'unreadOnly'].includes(key))
            continue;
        if (value === undefined || value === null || value === '')
            continue;
        sp.set(key, String(value));
    }
    const qs = sp.toString();
    return qs ? `?${qs}` : '';
}

/** Fetch all pages when a screen needs the full list (e.g. dashboard tab filters). */
export async function fetchAllPaginated<T>(
    fetchPage: (cursor?: string) => Promise<PaginatedResult<T>>,
    maxPages = 20,
): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
        const page = await fetchPage(cursor);
        all.push(...page.items);
        cursor = page.nextCursor ?? undefined;
        pages += 1;
    } while (cursor && pages < maxPages);
    return all;
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
    if (typeof window !== 'undefined') {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz)
                h['X-Client-Timezone'] = tz;
        }
        catch {
            /* ignore */
        }
    }
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
/** Browser: same-origin `/api/*` (Next rewrites). Server: direct Nest URL. */
function clientApiBase(): string {
    if (typeof window !== 'undefined')
        return '';
    return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function apiFetchUrl(path: string): string {
    const base = clientApiBase();
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return base ? `${base}${normalized}` : normalized;
}

async function readJsonResponse<T>(res: Response, label: string): Promise<T> {
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
        const preview = (await res.text()).trim().slice(0, 120);
        throw new Error(
            `${label} returned HTML instead of JSON (HTTP ${res.status}). `
            + 'Ensure the Nest API is running on port 3000 and Next rewrites use API_INTERNAL_URL=http://127.0.0.1:3000. '
            + `Response started with: ${preview || '(empty)'}`,
        );
    }
    return res.json() as Promise<T>;
}
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
    const res = await trackedFetch(apiFetchUrl('/api/upload'), {
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
async function parseAuthApiError(res: Response, label: string): Promise<Error> {
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
        return new Error(
            `${label} hit an HTML page (HTTP ${res.status}), not the API. `
            + 'Start the Nest backend on port 3000 and set API_INTERNAL_URL=http://127.0.0.1:3000 in frontend/.env.local.',
        );
    }
    return nestHttpError(text, res.status, label);
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
    sendOtp: async (email: string, role: Role): Promise<void> => {
        const res = await trackedFetch(apiFetchUrl('/api/auth/send-otp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role }),
        });
        if (!res.ok) {
            throw await parseAuthApiError(res, 'Send verification code');
        }
    },
    verifyOtp: async (email: string, otp: string, role: Role): Promise<{
        accessToken: string;
        refreshToken: string;
    }> => {
        const res = await trackedFetch(apiFetchUrl('/api/auth/verify-otp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, role }),
        });
        if (!res.ok) {
            throw await parseAuthApiError(res, 'Verify code');
        }
        return readJsonResponse<{ accessToken: string; refreshToken: string }>(
            res,
            'Verify code',
        );
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
    permanentDeleteAccount: async (): Promise<void> => {
    const res = await trackedFetch(`${NEST_BASE}/api/auth/me/permanent-delete`, {
        method: 'DELETE',
        headers: nestHeaders(false),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Could not delete account (${res.status})`);
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
    contactFirstName?: string | null;
    contactLastName?: string | null;
    cpsnsVerificationStatus?: import('@/lib/cpsnsVerify').CpsnsVerificationStatus | null;
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
    isDeleted?: boolean;
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
        isDeleted?: boolean;
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
        const res = await trackedFetch(apiFetchUrl('/api/public/recent-host-avatars'), {
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
    browseJobs: async (params?: PaginationQuery): Promise<PaginatedResult<BrowseJob>> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/jobs${buildPaginationQs(params)}`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading jobs');
        }
        return res.json() as Promise<PaginatedResult<BrowseJob>>;
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
    getDashboardStats: async (): Promise<{
        totalAcceptedShifts: number;
        completedShifts: number;
    }> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/stats`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading dashboard stats');
        }
        return res.json() as Promise<{
            totalAcceptedShifts: number;
            completedShifts: number;
        }>;
    },
    getMyApplications: async (params?: PaginationQuery): Promise<PaginatedResult<MyApplication>> => {
        const res = await trackedFetch(`${NEST_BASE}/api/locum/applications${buildPaginationQs(params)}`, {
            cache: 'no-store',
            headers: nestHeaders(false),
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading applications');
        }
        return res.json() as Promise<PaginatedResult<MyApplication>>;
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
    hasAcceptedLocum?: boolean;
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
        hasAcceptedLocum: r.hasAcceptedLocum === true,
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
    getJobs: async (opts?: PaginationQuery & { deleted?: boolean }): Promise<PaginatedResult<Job>> => {
        let res: Response;
        const qs = buildPaginationQs({
            ...opts,
            ...(opts?.deleted ? { deleted: 'true' } : {}),
        });
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
        const data = await res.json() as PaginatedResult<unknown>;
        return {
            items: (data.items ?? []).map((j) => normalizeHostJob(j)),
            nextCursor: data.nextCursor ?? null,
            hasNextPage: data.hasNextPage ?? false,
            total: data.total,
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
    getApplications: async (jobId: string, params?: PaginationQuery): Promise<PaginatedResult<ApplicationRecord>> => {
        let res: Response;
        try {
            res = await trackedFetch(`${NEST_BASE}/api/host/jobs/${encodeURIComponent(jobId)}/applications${buildPaginationQs(params)}`, { cache: 'no-store', headers: nestHeaders(false) });
        }
        catch (err) {
            throw networkFetchError('Loading applications', err);
        }
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading applications');
        }
        return res.json() as Promise<PaginatedResult<ApplicationRecord>>;
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
    getThread: async (partnerId: string, opts?: PaginationQuery & {
        skipTopLoader?: boolean;
        /** ISO timestamp — poll only messages newer than this (lighter on RAM/CPU). */
        since?: string;
    }): Promise<PaginatedResult<ThreadMessage> & { partner: ThreadPartner | null }> => {
        const sp = new URLSearchParams();
        if (opts?.since)
            sp.set('since', opts.since);
        if (opts?.cursor)
            sp.set('cursor', opts.cursor);
        if (opts?.limit != null)
            sp.set('limit', String(opts.limit));
        if (opts?.direction)
            sp.set('direction', opts.direction);
        const qs = sp.toString() ? `?${sp.toString()}` : '';
        const res = await trackedFetch(`${NEST_BASE}/api/messages/thread/${encodeURIComponent(partnerId)}${qs}`, {
            cache: 'no-store',
            headers: nestHeaders(false),
            skipTopLoader: opts?.skipTopLoader ?? false,
        });
        if (!res.ok) {
            const text = await res.text();
            throw nestHttpError(text, res.status, 'Loading thread');
        }
        return res.json() as Promise<PaginatedResult<ThreadMessage> & { partner: ThreadPartner | null }>;
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
            skipTopLoader: true,
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
            skipTopLoader: true,
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
            skipTopLoader: true,
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
export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL' | 'LOW';

export type NotificationItem = {
    id: string;
    type: 'message' | 'application' | 'shortlisted' | 'reminder' | 'account' | 'cancellation' | 'registration' | 'credential' | 'flagged';
    category?: 'messages' | 'applications' | 'reminders' | 'account' | 'cancellations';
    title: string;
    body: string;
    href: string;
    read?: boolean;
    createdAt: string;
    priority?: NotificationPriority;
    actionLabel?: string;
    eventType?: string;
};
export type NotificationsResponse = PaginatedResult<NotificationItem>;
export const notificationsApi = {
    get: async (opts?: PaginationQuery & {
        skipTopLoader?: boolean;
    }): Promise<NotificationsResponse> => {
        const res = await trackedFetch(`${NEST_BASE}/api/notifications${buildPaginationQs(opts)}`, {
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
    getVapidKey: async (): Promise<string> => {
        const res = await trackedFetch(`${NEST_BASE}/api/notifications/push/vapid-public-key`, {
            cache: 'no-store', headers: nestHeaders(false), skipTopLoader: true,
        });
        if (!res.ok) throw new Error('Failed to get VAPID key');
        const data = await res.json() as { key: string };
        return data.key;
    },
    subscribe: async (sub: PushSubscriptionJSON): Promise<void> => {
        const res = await trackedFetch(`${NEST_BASE}/api/notifications/push/subscribe`, {
            method: 'POST', cache: 'no-store', headers: nestHeaders(true), skipTopLoader: true,
            body: JSON.stringify(sub),
        });
        if (!res.ok) throw new Error('Failed to save push subscription');
    },
    unsubscribe: async (endpoint: string): Promise<void> => {
        await trackedFetch(`${NEST_BASE}/api/notifications/push/unsubscribe`, {
            method: 'DELETE', cache: 'no-store', headers: nestHeaders(true), skipTopLoader: true,
            body: JSON.stringify({ endpoint }),
        });
    },
    markRead: async (id: string): Promise<void> => {
        const res = await trackedFetch(`${NEST_BASE}/api/notifications/${encodeURIComponent(id)}/read`, {
            method: 'PATCH',
            cache: 'no-store',
            headers: nestHeaders(true),
            skipTopLoader: true,
        });
        if (!res.ok) throw new Error('Failed to mark notification read');
    },
};
