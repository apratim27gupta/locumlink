export const GENERIC_USER_ERROR = 'Something went wrong. Please try again.';

const TECHNICAL_ERROR_PATTERN = /ECONNREFUSED|prisma\.|Invalid `|invocation in|\.ts:\d+|fetch failed|Failed to fetch|internal server error|DATABASE_URL|connection refused|ENOTFOUND|ETIMEDOUT|Could not reach the app API|server error|Nest backend|npm run|HTML page \(HTTP/i;

/** Read a message from Error, Apple auth objects, or fetch failures. */
export function readErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message.trim();
    if (typeof err === 'string') return err.trim();
    if (typeof err === 'object' && err !== null) {
        const o = err as Record<string, unknown>;
        if (typeof o.error_description === 'string') return o.error_description.trim();
        if (typeof o.error === 'string') return o.error.trim();
        if (typeof o.message === 'string') return o.message.trim();
    }
    return '';
}

export function isTechnicalErrorMessage(message: string): boolean {
    const msg = message.trim();
    if (!msg)
        return false;
    if (msg.length > 100)
        return true;
    return TECHNICAL_ERROR_PATTERN.test(msg);
}

export function sanitizeErrorMessage(
    message: string | null | undefined,
    fallback = GENERIC_USER_ERROR,
): string {
    const msg = (message ?? '').trim();
    if (!msg)
        return '';
    if (isTechnicalErrorMessage(msg))
        return fallback;
    return msg;
}

export function toUserFacingError(
    err: unknown,
    fallback = GENERIC_USER_ERROR,
): string {
    const msg = readErrorMessage(err);
    if (!msg) return fallback;
    return sanitizeErrorMessage(msg, fallback);
}
