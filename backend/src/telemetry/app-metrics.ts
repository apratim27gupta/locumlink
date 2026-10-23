import { performance } from 'node:perf_hooks';
import { metrics, type Attributes, type ObservableResult } from '@opentelemetry/api';
import type { Pool } from 'pg';

const METER_NAME = 'locumlink-api';

/** Same window the Stripe reconciler waits before treating a row as stuck. */
const STUCK_WORK_AGE_MS = 2 * 60_000;
const DIGEST_DUE_AFTER_MS = 24 * 60 * 60 * 1000;

const POSTGRES_FAILURE_CODES = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1011',
  'P1017',
  'P2024',
  'P2037',
]);

const STRIPE_FAILURE_TYPES = new Set([
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
  'StripeAuthenticationError',
]);

export type DependencyName =
  | 'postgres'
  | 'twilio'
  | 'stripe'
  | 'gcs'
  | 'turnstile';

export type WorkName = 'email_digest' | 'stripe_checkout' | 'stripe_refund';

export type WorkPending = Record<WorkName, number>;

type WorkReader = () => Promise<WorkPending>;

let pool: Pool | undefined;
let readWork: WorkReader | undefined;
let instrumentsReady = false;

export function isPostgresDependencyFailure(code: string): boolean {
  return POSTGRES_FAILURE_CODES.has(code);
}

export function isStripeDependencyFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const type = (err as { type?: unknown }).type;
  return typeof type === 'string' && STRIPE_FAILURE_TYPES.has(type);
}

export function recordDependencyFailure(dependency: DependencyName): void {
  ensureInstruments();
  dependencyFailed.add(1, { dependency });
}

export function startCron(job: string): { failed: () => void; end: () => void } {
  ensureInstruments();
  const started = performance.now();
  let counted = false;
  return {
    failed() {
      if (counted) return;
      counted = true;
      jobFailed.add(1, { job });
    },
    end() {
      jobDuration.record((performance.now() - started) / 1000, { job });
    },
  };
}

/** Called once Nest has a pool. Idle-client errors are a Postgres failure. */
export function bindPgPool(next: Pool): void {
  if (pool === next) return;
  pool = next;
  next.on('error', () => {
    recordDependencyFailure('postgres');
  });
  ensureInstruments();
}

/** Called once Nest can count rows the crons have not finished. */
export function bindWorkPending(reader: WorkReader): void {
  readWork = reader;
  ensureInstruments();
}

export function stuckWorkCutoff(now = Date.now()): Date {
  return new Date(now - STUCK_WORK_AGE_MS);
}

export function digestDueCutoff(now = Date.now()): Date {
  return new Date(now - DIGEST_DUE_AFTER_MS);
}

const dependencyFailed = counter('locumlink.dependency.failed', {
  description:
    'Calls to Postgres, Twilio, Stripe, Cloud Storage, or Turnstile that failed.',
  unit: '{call}',
});
const jobFailed = counter('locumlink.job.failed', {
  description: 'Cron runs that threw.',
  unit: '{run}',
});
const jobDuration = histogram('locumlink.job.duration', {
  description: 'Seconds one cron run took.',
  unit: 's',
});

function counter(name: string, options: { description: string; unit: string }) {
  let instrument: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']> | undefined;
  return {
    add(value: number, attributes: Attributes) {
      instrument ??= metrics.getMeter(METER_NAME).createCounter(name, options);
      instrument.add(value, attributes);
    },
  };
}

function histogram(name: string, options: { description: string; unit: string }) {
  let instrument: ReturnType<ReturnType<typeof metrics.getMeter>['createHistogram']> | undefined;
  return {
    record(value: number, attributes: Attributes) {
      instrument ??= metrics.getMeter(METER_NAME).createHistogram(name, options);
      instrument.record(value, attributes);
    },
  };
}

function ensureInstruments(): void {
  if (instrumentsReady) return;
  instrumentsReady = true;
  const meter = metrics.getMeter(METER_NAME);

  const connections = meter.createObservableGauge('db.client.connection.count', {
    description: 'Postgres connections this process has open.',
    unit: '{connection}',
  });
  const pending = meter.createObservableGauge('db.client.connection.pending_requests', {
    description: 'Requests waiting for a free Postgres connection.',
    unit: '{connection}',
  });
  const workPending = meter.createObservableGauge('locumlink.work.pending', {
    description: 'Rows a cron has not finished.',
    unit: '{row}',
  });

  connections.addCallback((result) => {
    if (!pool) return;
    const idle = pool.idleCount;
    const used = Math.max(0, pool.totalCount - idle);
    result.observe(used, connectionAttributes('used'));
    result.observe(idle, connectionAttributes('idle'));
  });

  pending.addCallback((result) => {
    if (!pool) return;
    result.observe(pool.waitingCount, {
      'db.client.connection.pool.name': 'prisma',
    });
  });

  workPending.addCallback((result) => {
    void observeWork(result);
  });
}

function connectionAttributes(state: 'used' | 'idle'): Attributes {
  return {
    'db.client.connection.state': state,
    'db.client.connection.pool.name': 'prisma',
  };
}

async function observeWork(result: ObservableResult): Promise<void> {
  if (!readWork) return;
  try {
    const pending = await readWork();
    result.observe(pending.email_digest, { work: 'email_digest' });
    result.observe(pending.stripe_checkout, { work: 'stripe_checkout' });
    result.observe(pending.stripe_refund, { work: 'stripe_refund' });
  } catch {
    recordDependencyFailure('postgres');
  }
}
