export const ADMIN_JWT_STRATEGY = 'admin-jwt';
export const ADMIN_AUTH_COOKIE = 'll_admin';
export const ADMIN_AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

