import type { ConfigService } from '@nestjs/config';

export const ADMIN_JWT_STRATEGY = 'admin-jwt';
export const ADMIN_AUTH_COOKIE = 'll_admin';
export const ADMIN_AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/** OTP rows for locum/clinic email sign-in (`auth.service.ts`). */
export const USER_OTP_PURPOSE = 'user_auth';
/** Admin sign-in OTP. */
export const ADMIN_OTP_LOGIN = 'admin_login';

export const ADMIN_OTP_LENGTH = 6;
export const ADMIN_LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
export const ADMIN_OTP_RESEND_COOLDOWN_MS = 30 * 1000;

export const ADMIN_OTP_REQUEST_GENERIC =
  'If this email is registered as an admin, a verification code has been sent.';

export const ADMIN_OTP_EMAIL_NOT_AUTHORIZED =
  'This email is not authorized for admin access.';

export const ADMIN_OTP_VERIFY_GENERIC =
  'Invalid or expired verification code.';

/** Matches `npm run dev` (Next on 3001). Use port 3002 only if you run `npm run dev:3002 -w frontend`. */
const DEFAULT_ADMIN_FRONTEND = 'http://localhost:3001/admin';

export function adminFrontendOrigin(config: ConfigService): string {
  const frontend = config
    .get<string>('ADMIN_FRONTEND_REDIRECT_URL', DEFAULT_ADMIN_FRONTEND)
    .trim();
  try {
    return new URL(frontend).origin;
  } catch {
    return 'http://localhost:3001';
  }
}
