// TODO: move to persisted store (Redis/DB) if this needs to survive restarts/scale beyond a single instance

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptRecord = {
  count: number;
  windowStart: number;
  lockedUntil?: number;
};

const verifyAttempts = new Map<string, AttemptRecord>();
const requestAttempts = new Map<string, AttemptRecord>();

function recordKey(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}|${ip || 'unknown'}`;
}

function assertAllowed(
  store: Map<string, AttemptRecord>,
  email: string,
  ip: string,
): void {
  const key = recordKey(email, ip);
  const now = Date.now();
  const rec = store.get(key);
  if (!rec) return;
  if (rec.lockedUntil && now < rec.lockedUntil) {
    throw new AdminLoginRateLimitError();
  }
  if (now - rec.windowStart > WINDOW_MS) {
    store.delete(key);
  }
}

function recordAttempt(
  store: Map<string, AttemptRecord>,
  email: string,
  ip: string,
): void {
  const key = recordKey(email, ip);
  const now = Date.now();
  const rec = store.get(key);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS;
  }
  store.set(key, rec);
}

function clearAttempts(
  store: Map<string, AttemptRecord>,
  email: string,
  ip: string,
): void {
  store.delete(recordKey(email, ip));
}

/** Returns false when OTP request should be silently skipped (still return generic success). */
export function shouldAllowAdminOtpRequest(email: string, ip: string): boolean {
  try {
    assertAllowed(requestAttempts, email, ip);
  } catch {
    return false;
  }
  recordAttempt(requestAttempts, email, ip);
  return true;
}

export function assertAdminVerifyAllowed(email: string, ip: string): void {
  assertAllowed(verifyAttempts, email, ip);
}

export function recordAdminVerifyFailure(email: string, ip: string): void {
  recordAttempt(verifyAttempts, email, ip);
}

export function clearAdminVerifyAttempts(email: string, ip: string): void {
  clearAttempts(verifyAttempts, email, ip);
}

export class AdminLoginRateLimitError extends Error {
  constructor() {
    super('Too many attempts. Please try again later.');
    this.name = 'AdminLoginRateLimitError';
  }
}
