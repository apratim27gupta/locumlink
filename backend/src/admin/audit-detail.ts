const SKIP_KEYS = new Set([
  'fingerprint',
  'idempotencyKey',
  'subjectLength',
  'queued',
  'sentEmail',
  'sentNotification',
]);

const KEY_LABELS: Record<string, string> = {
  status: 'Account status',
  role: 'Role',
  cpsnsVerificationStatus: 'Verification',
  rejectionReason: 'Rejection reason',
  profileReminderChannel: 'Reminder sent by',
  lastProfileReminderAt: 'Reminder sent at',
  action: 'Action',
  email: 'Email',
  reactivatedFromDeactivation: 'Account reactivated after deactivation',
  reRegisteredAfterDeactivation: 'Registered again after deactivation',
  suspensionNote: 'Suspension note',
  channels: 'Sent by',
  recipientCount: 'No. of users',
  failedCount: 'Failed',
  selectAllFiltered: 'Audience',
  error: 'Error',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pluralUsers(count: number): string {
  return count === 1 ? 'user' : 'users';
}

function humanizeToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'none';
  if (trimmed === 'email' || trimmed === 'notification') return trimmed;
  if (/^[A-Z0-9_]+$/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return trimmed.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function formatChannels(channels: unknown): string {
  if (!Array.isArray(channels) || channels.length === 0) return '';
  const labels = channels
    .map((channel) =>
      channel === 'email'
        ? 'email'
        : channel === 'notification'
          ? 'notification'
          : humanizeToken(String(channel)),
    )
    .filter(Boolean);
  if (labels.length === 0) return '';
  if (labels.length === 1) return ` by ${labels[0]}`;
  if (labels.length === 2) return ` by ${labels[0]} and ${labels[1]}`;
  return ` by ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function formatBroadcastDetail(after: Record<string, unknown>): string {
  const count =
    typeof after.recipientCount === 'number' ? after.recipientCount : 0;
  const failed = typeof after.failedCount === 'number' ? after.failedCount : 0;
  const channels = formatChannels(after.channels);
  const audience = after.selectAllFiltered
    ? 'matching the current filters'
    : 'selected';
  const users = `${count} ${audience} ${pluralUsers(count)}`;

  if (typeof after.error === 'string' && after.error.trim()) {
    return `Broadcast failed for ${users}${channels}. ${after.error.trim()}`;
  }
  if (after.queued === true) {
    return `Broadcast queued for ${users}${channels}.`;
  }
  if (failed > 0) {
    return `Broadcast finished for ${users}${channels}. ${failed} failed.`;
  }
  return `Broadcast sent to ${users}${channels}.`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return humanizeToken(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(', ') || 'none';
  }
  return humanizeToken(String(value));
}

function formatLabeled(key: string, value: unknown): string {
  if (key === 'selectAllFiltered') {
    return value
      ? 'Audience: everyone matching the current filters'
      : 'Audience: selected users';
  }
  if (key === 'channels') {
    const text = formatChannels(value).replace(/^ by /, '');
    return text ? `Sent by: ${text}` : 'Sent by: none';
  }
  const label = KEY_LABELS[key] ?? humanizeToken(key);
  return `${label}: ${formatValue(value)}`;
}

function formatDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const parts: string[] = [];
  for (const key of keys) {
    if (SKIP_KEYS.has(key)) continue;
    const left = JSON.stringify(before[key]);
    const right = JSON.stringify(after[key]);
    if (left === right) continue;
    const label = KEY_LABELS[key] ?? humanizeToken(key);
    const hadBefore = before[key] !== undefined && before[key] !== null && before[key] !== '';
    if (hadBefore) {
      parts.push(
        `${label} changed from ${formatValue(before[key])} to ${formatValue(after[key])}`,
      );
    } else {
      parts.push(formatLabeled(key, after[key]));
    }
  }
  return parts.join('. ');
}

export function formatAuditDetail(params: {
  entity?: string;
  before?: unknown;
  after?: unknown;
}): string {
  const after = isRecord(params.after) ? params.after : null;
  const before = isRecord(params.before) ? params.before : null;

  if (params.entity === 'UserBroadcast' && after) {
    return formatBroadcastDetail(after);
  }

  if (before && after) {
    const diff = formatDiff(before, after);
    if (diff) return diff.endsWith('.') ? diff : `${diff}.`;
  }

  if (after) {
    const parts = Object.keys(after)
      .filter((key) => !SKIP_KEYS.has(key))
      .map((key) => formatLabeled(key, after[key]));
    if (parts.length) {
      const text = parts.join('. ');
      return text.endsWith('.') ? text : `${text}.`;
    }
  }

  return '';
}

export function formatAuditEntity(entity: string): string {
  const labels: Record<string, string> = {
    UserBroadcast: 'Broadcast',
    AnalyticsReport: 'Analytics report',
    UserReport: 'User report',
    LocumProfile: 'Locum profile',
    HostProfile: 'Host profile',
    User: 'User',
  };
  return labels[entity] ?? humanizeToken(entity);
}

export function formatAuditAction(action: string): string {
  const labels: Record<string, string> = {
    UPDATE: 'Update',
    CREATE: 'Create',
    EXPORT: 'Export',
    STATUS_CHANGE: 'Status change',
    LOGIN: 'Sign in',
    DELETE: 'Delete',
  };
  return labels[action] ?? humanizeToken(action);
}

export function formatAuditOutcome(outcome: string): string {
  const labels: Record<string, string> = {
    SUCCESS: 'Success',
    QUEUED: 'Queued',
    PARTIAL: 'Partial',
    FAILURE: 'Failed',
  };
  return labels[outcome] ?? humanizeToken(outcome);
}
