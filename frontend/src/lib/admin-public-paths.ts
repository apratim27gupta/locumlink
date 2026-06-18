/** Admin routes that do not require an authenticated session. */
export const ADMIN_PUBLIC_PATHS = ['/admin/login'] as const;

export function isAdminPublicPath(pathname: string): boolean {
  return ADMIN_PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
