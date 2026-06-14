import type { HostProfile, LocumProfile } from './index';

export type UserRole = 'HOST' | 'LOCUM' | 'ADMIN';

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
  deleted?: boolean;
  since?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthMeResponse = {
  id: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  status?: string;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type BrowseJobHostProfile = {
  practiceName: string;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  cpsnsVerificationStatus?: string | null;
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

export type PostingStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

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
    user: { email: string };
  };
};

export type DashboardStats = {
  totalJobsPosted: number;
  activeJobs: number;
  completedJobs: number;
  applications: number;
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
  requiredCredentials?: string[];
  status?: 'ACTIVE' | 'DRAFT';
  saveAsDraft?: boolean;
}

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

export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL' | 'LOW';

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  priority?: NotificationPriority;
  href?: string | null;
};

export type NotificationsResponse = PaginatedResult<NotificationItem>;

export type { HostProfile, LocumProfile };
