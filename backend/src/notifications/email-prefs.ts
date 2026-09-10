/**
 * User email notification preferences.
 * Missing / null prefs → all categories default ON.
 * Always emailed (not togglable): cancellations, OTP, admin broadcasts.
 */

export const EMAIL_PREF_KEYS = [
  'messages',
  'applications',
  'reminders',
  'account',
] as const;

export type EmailPrefKey = (typeof EMAIL_PREF_KEYS)[number];

export type EmailPrefs = Record<EmailPrefKey, boolean>;

export const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  messages: true,
  applications: true,
  reminders: true,
  account: true,
};

export function resolveEmailPrefs(raw: unknown): EmailPrefs {
  const base = { ...DEFAULT_EMAIL_PREFS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;
  for (const key of EMAIL_PREF_KEYS) {
    if (typeof obj[key] === 'boolean') base[key] = obj[key];
  }
  return base;
}

/** Map notification event type → email preference category (null = always send). */
export function emailPrefKeyForEventType(
  eventType: string,
): EmailPrefKey | null {
  if (
    eventType.includes('CANCELLED') ||
    eventType.includes('CANCELLATION')
  ) {
    return null;
  }
  // Admin broadcast emails are not user-togglable.
  if (eventType === 'U_001_ADMIN_MESSAGE') return null;
  if (eventType.includes('MESSAGE')) return 'messages';
  if (eventType.includes('REMINDER') || eventType.includes('EXPIRING')) {
    return 'reminders';
  }
  if (
    eventType.includes('VERIFIED') ||
    eventType.includes('REJECTED') ||
    eventType.includes('SUSPENDED') ||
    eventType.includes('WARNING') ||
    eventType.includes('PROFILE_REMINDER') ||
    eventType.includes('ACCOUNT_')
  ) {
    return 'account';
  }
  if (
    eventType.includes('APPLIED') ||
    eventType.includes('ACCEPTED') ||
    eventType.includes('DECLINED') ||
    eventType.includes('CONFIRMED') ||
    eventType.includes('OPPORTUNITY') ||
    eventType.includes('JOB_POSTED')
  ) {
    return 'applications';
  }
  return 'account';
}

export function allowsEmailForEvent(
  prefsRaw: unknown,
  eventType: string,
): boolean {
  const key = emailPrefKeyForEventType(eventType);
  if (key == null) return true;
  return resolveEmailPrefs(prefsRaw)[key];
}
