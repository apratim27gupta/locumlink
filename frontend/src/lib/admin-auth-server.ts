import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { ensureAdminEnv } from '@/lib/ensure-admin-env';

export interface AdminSession {
  adminId: string;
  actorEmail: string;
}

export async function getAdminSession(
  request?: Request,
): Promise<AdminSession | null> {
  ensureAdminEnv();
  const secret =
    process.env.ADMIN_JWT_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) {
    console.error('[admin-auth] ADMIN_JWT_SECRET or JWT_SECRET must be set');
    return null;
  }

  let token = (await cookies()).get('ll_admin')?.value ?? null;
  if (!token && request) {
    const cookieHeader = request.headers.get('cookie') ?? '';
    const match = cookieHeader.match(/(?:^|;\s*)ll_admin=([^;]+)/);
    if (match?.[1]) {
      try {
        token = decodeURIComponent(match[1]);
      } catch {
        token = match[1];
      }
    }
  }
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );

    if (payload.role !== 'admin') return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;

    const actorEmail =
      typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const allowed = (
      process.env.ADMIN_ALLOWED_EMAIL ?? 'aroradamini873@gmail.com'
    )
      .trim()
      .toLowerCase();
    if (!actorEmail || actorEmail !== allowed) return null;

    return {
      adminId: payload.sub,
      actorEmail,
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(
  request?: Request,
): Promise<AdminSession | null> {
  return getAdminSession(request);
}
