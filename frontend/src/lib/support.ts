const DEFAULT_SUPPORT_EMAIL = 'support@locumlink.ca';

export function getSupportEmail(): string {
    return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}

export function contactSupportMailtoHref(subject = 'Account suspension — support request'): string {
    const email = getSupportEmail();
    return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
