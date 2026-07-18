import type { ConfigService } from '@nestjs/config';
import {
  getReviewPlaygroundEmails,
  isReviewPlaygroundEmail,
} from './review-playground.util.js';

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
 * App Store / QA review accounts: fixed OTP, no outbound email.
 * Emails: DEFAULT_REVIEW_PLAYGROUND_EMAILS (+ optional REVIEW_OTP_EMAILS extras).
 * Code: REVIEW_OTP_CODE or 000000. Same playground isolation as browse.
 */
export function getReviewOtpForEmail(
  email: string,
  config: ConfigService,
  otpLength: number,
): string | null {
  const allowed = getReviewPlaygroundEmails(config);
  if (!isReviewPlaygroundEmail(email, allowed)) return null;

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
