/** HttpOnly cookie handoff for Apple form_post across browser ↔ WebView contexts. */
export const APPLE_PENDING_COOKIE = 'll_apple_pending';

export const APPLE_PENDING_MAX_AGE_SEC = 120;

export type ApplePendingPayload = {
  id_token: string;
  code?: string;
  user?: {
    email?: string | null;
    name?: {
      firstName?: string | null;
      middleName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
};

export function encodeApplePendingPayload(payload: ApplePendingPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeApplePendingPayload(raw: string): ApplePendingPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as ApplePendingPayload;
    if (!parsed?.id_token) return null;
    return parsed;
  } catch {
    return null;
  }
}
