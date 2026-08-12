import type { Role } from '@prisma/client';

export const DIGEST_FLUSH_COUNT = 10;
export const DIGEST_FLUSH_DELAY_MS = 24 * 60 * 60 * 1000;
export const DIGEST_EMAIL_LIST_LIMIT = 10;

export const DIGEST_CATEGORIES = ['applications', 'messages'] as const;
export type DigestCategory = (typeof DIGEST_CATEGORIES)[number];

export type DigestEventType =
  | 'L_001_NEW_OPPORTUNITY'
  | 'L_008_NEW_MESSAGE'
  | 'H_004_NEW_MESSAGE';

export const DIGEST_EVENT_TYPES = new Set<DigestEventType>([
  'L_001_NEW_OPPORTUNITY',
  'L_008_NEW_MESSAGE',
  'H_004_NEW_MESSAGE',
]);

const CATEGORY_EVENT_TYPES: Record<DigestCategory, DigestEventType[]> = {
  applications: ['L_001_NEW_OPPORTUNITY'],
  messages: ['L_008_NEW_MESSAGE', 'H_004_NEW_MESSAGE'],
};

export type CategoryDigestState = {
  lastDigestFlushedAt: string | null;
  lastPendingAt: string | null;
};

export type EmailDigestState = Partial<
  Record<DigestCategory, CategoryDigestState>
>;

export function isDigestEventType(eventType: string): eventType is DigestEventType {
  return DIGEST_EVENT_TYPES.has(eventType as DigestEventType);
}

export function digestCategoryForEventType(
  eventType: string,
): DigestCategory | null {
  if (eventType === 'L_001_NEW_OPPORTUNITY') return 'applications';
  if (eventType === 'L_008_NEW_MESSAGE' || eventType === 'H_004_NEW_MESSAGE') {
    return 'messages';
  }
  return null;
}

export function eventTypesForDigestCategory(
  category: DigestCategory,
): DigestEventType[] {
  return CATEGORY_EVENT_TYPES[category];
}

export function parseEmailDigestState(raw: unknown): EmailDigestState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: EmailDigestState = {};
  for (const key of DIGEST_CATEGORIES) {
    const entry = obj[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    out[key] = {
      lastDigestFlushedAt:
        typeof row.lastDigestFlushedAt === 'string'
          ? row.lastDigestFlushedAt
          : null,
      lastPendingAt:
        typeof row.lastPendingAt === 'string' ? row.lastPendingAt : null,
    };
  }
  return out;
}

export function getCategoryDigestState(
  state: EmailDigestState,
  category: DigestCategory,
): CategoryDigestState {
  return (
    state[category] ?? { lastDigestFlushedAt: null, lastPendingAt: null }
  );
}

export function digestFlushAnchor(
  categoryState: CategoryDigestState,
): Date {
  if (!categoryState.lastDigestFlushedAt) return new Date(0);
  return new Date(categoryState.lastDigestFlushedAt);
}

type DigestPayload = {
  title?: string;
  body?: string;
  href?: string;
};

const APP_URL = 'https://locumlink.ca';

function digestItemLine(payload: unknown): string {
  const p = (payload ?? {}) as DigestPayload;
  const line = p.body?.trim() || p.title?.trim() || 'Update';
  return `• ${line}`;
}

export function buildDigestEmail(params: {
  category: DigestCategory;
  role: Role;
  items: Array<{ payload: unknown }>;
}): { subject: string; text: string } {
  const count = params.items.length;
  const newestFirst = [...params.items].reverse();
  const shown = newestFirst.slice(0, DIGEST_EMAIL_LIST_LIMIT);
  const lines = shown.map((item) => digestItemLine(item.payload));
  const remaining = count - shown.length;

  if (params.category === 'applications') {
    const subject =
      count === 1
        ? '1 new locum opportunity'
        : `${count} new locum opportunities`;
    let text = `You have ${count} new locum ${count === 1 ? 'opportunity' : 'opportunities'} on Locum Link.\n\n${lines.join('\n')}`;
    if (remaining > 0) {
      text += `\n\nAnd ${remaining} more in your account.`;
    }
    text += `\n\nBrowse opportunities: ${APP_URL}/locum/browse`;
    return { subject, text };
  }

  const subject =
    count === 1 ? '1 new message on Locum Link' : `${count} new messages on Locum Link`;
  const inboxPath =
    params.role === 'HOST' ? '/host/messages' : '/locum/messages';
  let text = `You have ${count} new ${count === 1 ? 'message' : 'messages'}.\n\n${lines.join('\n')}`;
  if (remaining > 0) {
    text += `\n\nAnd ${remaining} more in your inbox.`;
  }
  text += `\n\nOpen messages: ${APP_URL}${inboxPath}`;
  return { subject, text };
}
