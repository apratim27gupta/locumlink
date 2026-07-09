import type { ConfigService } from '@nestjs/config';

const DEFAULT_REVIEW_OTP_EMAILS = ['reviewlocum@locumlink.ca'];
const DEFAULT_REVIEW_OTP_CODE = '000000';

function parseOtpDigits(raw: string | undefined, otpLength: number): string | null {
  const code = raw?.trim();
  if (!code || !new RegExp(`^\\d{${otpLength}}$`).test(code)) return null;
  return code;
}

/**
 * When NODE_ENV=staging and FIXED_OTP_CODE is set to a valid N-digit string,
 * OTP flows use that code and skip outbound email (staging VMs only).
 */
export function getFixedOtpForStaging(
  config: ConfigService,
  otpLength: number,
): string | null {
  const nodeEnv = config.get<string>('NODE_ENV')?.trim();
  if (nodeEnv !== 'staging') return null;

  return parseOtpDigits(config.get<string>('FIXED_OTP_CODE'), otpLength);
}

/**
 * App Store / QA review accounts on production: fixed OTP, no outbound email.
 * Override via REVIEW_OTP_EMAILS (comma-separated) and REVIEW_OTP_CODE.
 */
export function getReviewOtpForEmail(
  email: string,
  config: ConfigService,
  otpLength: number,
): string | null {
  const normalized = email.trim().toLowerCase();
  const rawList = config.get<string>('REVIEW_OTP_EMAILS')?.trim();
  const allowed = rawList
    ? rawList.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_REVIEW_OTP_EMAILS;

  if (!allowed.includes(normalized)) return null;

  return parseOtpDigits(
    config.get<string>('REVIEW_OTP_CODE') ?? DEFAULT_REVIEW_OTP_CODE,
    otpLength,
  );
}

/** Staging fixed OTP, else per-email review OTP if configured. */
export function getFixedAuthOtp(
  email: string,
  config: ConfigService,
  otpLength: number,
): string | null {
  return (
    getFixedOtpForStaging(config, otpLength)
    ?? getReviewOtpForEmail(email, config, otpLength)
  );
}
