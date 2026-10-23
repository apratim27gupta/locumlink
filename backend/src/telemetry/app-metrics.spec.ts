import {
  digestDueCutoff,
  isPostgresDependencyFailure,
  isStripeDependencyFailure,
  stuckWorkCutoff,
} from './app-metrics.js';
import { dropAutoInstrumentationMetrics } from './drop-auto-metrics.js';

describe('app metrics', () => {
  it('treats connection and pool timeouts as Postgres failures', () => {
    expect(isPostgresDependencyFailure('P1001')).toBe(true);
    expect(isPostgresDependencyFailure('P2024')).toBe(true);
    expect(isPostgresDependencyFailure('P2002')).toBe(false);
    expect(isPostgresDependencyFailure('P2025')).toBe(false);
  });

  it('treats Stripe outages as dependency failures and ignores invalid requests', () => {
    expect(isStripeDependencyFailure({ type: 'StripeConnectionError' })).toBe(true);
    expect(isStripeDependencyFailure({ type: 'StripeAPIError' })).toBe(true);
    expect(isStripeDependencyFailure({ type: 'StripeInvalidRequestError' })).toBe(false);
    expect(isStripeDependencyFailure(new Error('missing email'))).toBe(false);
  });

  it('ages stuck Stripe work by two minutes and digests by a day', () => {
    const now = Date.parse('2026-10-22T12:00:00Z');
    expect(stuckWorkCutoff(now).toISOString()).toBe('2026-10-22T11:58:00.000Z');
    expect(digestDueCutoff(now).toISOString()).toBe('2026-10-21T12:00:00.000Z');
  });

  it('drops every instrument from the auto-instrumentation meters', () => {
    const meters = dropAutoInstrumentationMetrics().map((view) => view.meterName);
    expect(meters).toEqual([
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-undici',
      '@opentelemetry/instrumentation-pg',
      '@opentelemetry/instrumentation-runtime-node',
      '@opentelemetry/instrumentation-host-metrics',
    ]);
    expect(dropAutoInstrumentationMetrics().every((view) => view.instrumentName === '*')).toBe(
      true,
    );
  });
});
