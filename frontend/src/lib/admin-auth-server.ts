import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export interface AdminSession {
  adminId: string;
  actorEmail: string;
}

export async function getAdminSession(
  request?: Request,
): Promise<AdminSession | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[admin-auth] JWT_SECRET is not set');
    return null;
  }

  const token = (await cookies()).get('ll_admin')?.value ?? null;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );

    if (payload.role !== 'admin') return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;

    return {
      adminId: payload.sub,
      actorEmail: typeof payload.email === 'string' ? payload.email : 'admin',
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
