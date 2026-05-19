import type { ConfigService } from '@nestjs/config';

export const ADMIN_JWT_STRATEGY = 'admin-jwt';
/** Passport Google OAuth for admin only (credentials in `backend/.env`, not Supabase). */
export const ADMIN_GOOGLE_STRATEGY = 'admin-google';
export const ADMIN_AUTH_COOKIE = 'll_admin';
export const ADMIN_AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

const DEFAULT_ADMIN_FRONTEND = 'http://localhost:3002/admin/dashboard';

/**
 * Google OAuth redirect URI sent to Google. Derived from ADMIN_FRONTEND_REDIRECT_URL
 * so port 3002 and Codespaces stay in sync. Stale GOOGLE_ADMIN_CALLBACK_URL on :3000
 * is ignored when it disagrees with the frontend origin.
 */
export function resolveAdminGoogleCallbackUrl(config: ConfigService): string {
  const frontend = config
    .get<string>('ADMIN_FRONTEND_REDIRECT_URL', DEFAULT_ADMIN_FRONTEND)
    .trim();
  let derived: string;
  try {
    derived = `${new URL(frontend).origin}/api/admin-auth/google/callback`;
  } catch {
    derived = 'http://localhost:3002/api/admin-auth/google/callback';
  }

  const explicit = config.get<string>('GOOGLE_ADMIN_CALLBACK_URL', '').trim();
  if (!explicit) return derived;

  try {
    const explicitOrigin = new URL(explicit).origin;
    const derivedOrigin = new URL(derived).origin;
    if (explicitOrigin !== derivedOrigin) {
      console.warn(
        `[admin-auth] GOOGLE_ADMIN_CALLBACK_URL (${explicit}) does not match ` +
          `ADMIN_FRONTEND_REDIRECT_URL (${derivedOrigin}). Using ${derived}. ` +
          `Remove or fix GOOGLE_ADMIN_CALLBACK_URL in backend/.env and match Google Cloud.`,
      );
      return derived;
    }
    return explicit;
  } catch {
    return explicit;
  }
}

