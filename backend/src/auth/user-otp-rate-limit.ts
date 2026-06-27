// In-memory OTP verify rate limit (mirrors admin-login-rate-limit.ts).

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptRecord = {
  count: number;
  windowStart: number;
  lockedUntil?: number;
};

const verifyAttempts = new Map<string, AttemptRecord>();

function recordKey(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}|${ip || 'unknown'}`;
}

function assertAllowed(email: string, ip: string): void {
  const key = recordKey(email, ip);
  const now = Date.now();
  const rec = verifyAttempts.get(key);
  if (!rec) return;
  if (rec.lockedUntil && now < rec.lockedUntil) {
    throw new UserOtpRateLimitError();
  }
  if (now - rec.windowStart > WINDOW_MS) {
    verifyAttempts.delete(key);
  }
}

function recordAttempt(email: string, ip: string): void {
  const key = recordKey(email, ip);
  const now = Date.now();
  const rec = verifyAttempts.get(key);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    verifyAttempts.set(key, { count: 1, windowStart: now });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS;
  }
  verifyAttempts.set(key, rec);
}

export function assertUserOtpVerifyAllowed(email: string, ip: string): void {
  assertAllowed(email, ip);
}

export function recordUserOtpVerifyFailure(email: string, ip: string): void {
  recordAttempt(email, ip);
}

export function clearUserOtpVerifyAttempts(email: string, ip: string): void {
  verifyAttempts.delete(recordKey(email, ip));
}

export class UserOtpRateLimitError extends Error {
  constructor() {
    super('Too many attempts. Please try again later.');
    this.name = 'UserOtpRateLimitError';
  }
}
