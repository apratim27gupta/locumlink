import { isNoiseError } from '../common/ops-alert.constants.js';

/**
 * What Helix should receive from locumlink-api.
 *
 * Traces: one request, with database and outbound calls as children.
 * Logs: every record the SDK emits, including request lines, auth failures,
 * and Nest startup. Metrics: host and process numbers. Request latency stays
 * on the trace.
 */

const DROPPED_SPAN_NAMES = new Set([
  'pg.connect',
  'pg-pool.connect',
  'ipc.connect',
]);

/** Nest HttpExceptions that are client outcomes, not outages. */
const CLIENT_EXCEPTION_TYPES = new Set([
  'BadRequestException',
  'UnauthorizedException',
  'ForbiddenException',
  'NotFoundException',
  'ConflictException',
  'NotAcceptableException',
  'RequestTimeoutException',
  'GoneException',
  'PayloadTooLargeException',
  'UnsupportedMediaTypeException',
  'UnprocessableEntityException',
  'ThrottlerException',
]);

const PATH_ATTRIBUTE_KEYS = [
  'url.path',
  'http.route',
  'http.target',
  'url.full',
  'http.url',
] as const;

export type SpanEventView = {
  name: string;
  attributes?: Record<string, unknown>;
};

export type SpanView = {
  name: string;
  attributes?: Record<string, unknown>;
  events?: SpanEventView[];
};

export function isProbePath(path: string): boolean {
  const pathname = path.split('?')[0].replace(/\/+$/, '') || '/';
  return pathname === '/health' || pathname === '/api/health';
}

export function shouldDropSpan(span: SpanView): boolean {
  if (
    DROPPED_SPAN_NAMES.has(span.name) ||
    span.name.startsWith('middleware -')
  ) {
    return true;
  }
  const nestType = stringAttr(span.attributes, 'nestjs.type');
  if (nestType === 'app_creation' || nestType === 'handler') return true;
  if (isProbePath(spanPath(span))) return true;
  return isHealthProbeQuery(span.attributes);
}

export function isExpectedClientFailure(span: SpanView): boolean {
  const httpStatus = httpStatusOf(span.attributes);
  if (httpStatus != null && httpStatus >= 500) return false;

  const type = exceptionType(span);
  if (type && CLIENT_EXCEPTION_TYPES.has(type)) return true;

  const message = exceptionMessage(span);
  if (httpStatus != null && message && isNoiseError(httpStatus, message)) {
    return true;
  }
  return false;
}

function isHealthProbeQuery(
  attributes: Record<string, unknown> | undefined,
): boolean {
  const statement =
    stringAttr(attributes, 'db.query.text') ??
    stringAttr(attributes, 'db.statement');
  if (!statement) return false;
  return statement.replace(/\s+/g, ' ').trim().toUpperCase() === 'SELECT 1';
}

function spanPath(span: SpanView): string {
  for (const key of PATH_ATTRIBUTE_KEYS) {
    const value = stringAttr(span.attributes, key);
    if (value) return value;
  }
  return span.name;
}

function exceptionType(span: SpanView): string | undefined {
  return exceptionAttr(span, 'exception.type');
}

function exceptionMessage(span: SpanView): string {
  return (
    exceptionAttr(span, 'exception.message') ??
    stringAttr(span.attributes, 'status_message') ??
    ''
  );
}

function exceptionAttr(span: SpanView, key: string): string | undefined {
  for (const event of span.events ?? []) {
    if (event.name !== 'exception') continue;
    const value = stringAttr(event.attributes, key);
    if (value) return value;
  }
  return undefined;
}

function httpStatusOf(
  attributes: Record<string, unknown> | undefined,
): number | undefined {
  return (
    numberAttr(attributes, 'http.response.status_code') ??
    numberAttr(attributes, 'http.status_code')
  );
}

function stringAttr(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberAttr(
  attributes: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = attributes?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
