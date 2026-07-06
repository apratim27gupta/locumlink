import { getAppOrigin } from '@/lib/appOrigin';

const DEFAULT_SUPPORT_EMAIL = 'support@locumlink.ca';

/** Relative paths — resolve against the current host (local, staging, or prod). */
export const SUPPORT_PAGE_PATH = '/support';
export const PRIVACY_POLICY_PATH = '/documents/privacy-policy.pdf';
export const TERMS_OF_USE_PATH = '/documents/terms-of-use.pdf';

/** @deprecated Use PRIVACY_POLICY_PATH — kept for existing imports. */
export const PRIVACY_POLICY_URL = PRIVACY_POLICY_PATH;
/** @deprecated Use TERMS_OF_USE_PATH — kept for existing imports. */
export const TERMS_OF_USE_URL = TERMS_OF_USE_PATH;

export function getSupportEmail(): string {
    return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}

export function contactSupportMailtoHref(subject = 'Locum Link support request'): string {
    const email = getSupportEmail();
    return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

/** Absolute support page URL for the current environment (staging, prod, or local). */
export function getSupportPageUrl(): string {
    return `${getAppOrigin()}${SUPPORT_PAGE_PATH}`;
}
