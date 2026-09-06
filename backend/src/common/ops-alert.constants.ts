/** Case-insensitive partial matches — expected client/auth noise, never ops-alert. */
export const NOISE_ERROR_PATTERNS = [
  'invalid or expired verification code',
  'invalid otp',
  'expired otp',
  'otp has expired',
  'invalid credentials',
  'invalid session',
  'unauthorized exception',
  'please wait',
  'a 6-digit verification code is required',
  'email is required',
  'must be an email',
  'email must be an email',
  'invalid email',
  'must be one of the following values',
  'bad request exception',
  'this email is not authorized for admin access',
  'captcha verification',
  'too many requests',
  'throttler',
];

/** Partial matches that should trigger admin alerts even on 4xx. */
export const FORCE_ALERT_PATTERNS = [
  'otp email failed',
  'could not send verification email',
];

export const SLOW_API_LOG_PREFIX = 'SLOW_API:';
export const HEALTH_CHECK_LOG_PREFIX = 'HEALTH_CHECK_FAILED:';

export const DEFAULT_SLOW_API_THRESHOLD_MS = 1500;

export function isNoiseError(statusCode: number, message: string): boolean {
  if (statusCode >= 500) return false;
  const lower = (message ?? '').toLowerCase();
  // Expected client auth failures (stale tokens, sync-supabase, etc.).
  if (statusCode === 401) return true;
  if (statusCode === 429) return true;
  // Client DTO / ValidationPipe 400s — prompt the user, do not alert ops.
  if (statusCode === 400 && lower === 'bad request exception') return true;
  return NOISE_ERROR_PATTERNS.some((p) => lower.includes(p));
}

export function shouldOpsAlert(statusCode: number, message: string): boolean {
  const lower = (message ?? '').toLowerCase();
  if (FORCE_ALERT_PATTERNS.some((p) => lower.includes(p))) return true;
  if (statusCode >= 500) return true;
  if (lower.startsWith(SLOW_API_LOG_PREFIX.toLowerCase())) return true;
  if (lower.startsWith(HEALTH_CHECK_LOG_PREFIX.toLowerCase())) return true;
  return false;
}

/** Flatten Nest HttpException / ValidationPipe response into a loggable string. */
export function httpExceptionLogMessage(err: {
  message?: unknown;
  getResponse?: () => string | object;
}): string {
  const res = typeof err.getResponse === 'function' ? err.getResponse() : null;
  if (res && typeof res === 'object') {
    const raw = (res as { message?: unknown }).message;
    if (Array.isArray(raw)) {
      const joined = raw.map((m) => String(m)).filter(Boolean).join('; ');
      if (joined) return joined;
    }
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  if (typeof err.message === 'string' && err.message.trim()) {
    return err.message.trim();
  }
  return 'Unknown error';
}
