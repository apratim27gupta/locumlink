import { hostname } from 'node:os';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  helixHeaders,
  ingestBaseUrl,
  ingestionKey,
  isCollectorEndpoint,
  signalUrl,
} from './lib/helix-ingest';

function startWebTelemetry(): void {
  const key = ingestionKey(process.env);
  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'locumlink-web';
  const ingestBase = ingestBaseUrl(process.env);
  const headers = helixHeaders(key);
  const tracesUrl = signalUrl(
    ingestBase,
    'traces',
    process.env.HELIX_TRACES_URL || process.env.HOLOTRACER_TRACES_URL,
  );
  const metricsUrl = signalUrl(
    ingestBase,
    'metrics',
    process.env.HELIX_METRICS_URL || process.env.HOLOTRACER_METRICS_URL,
  );
  const logsUrl = signalUrl(
    ingestBase,
    'logs',
    process.env.HELIX_LOGS_URL || process.env.HOLOTRACER_LOGS_URL,
  );
  const sendingToCollector = [tracesUrl, metricsUrl, logsUrl].some(isCollectorEndpoint);

  if (!key) {
    console.warn(
      '[otel] HELIX_INGESTION_KEY missing — web traces/logs/metrics will not export',
    );
    return;
  }
  if (sendingToCollector) {
    console.error(
      '[otel] refusing collector port 4317/4318. Send OTLP to the Helix ingest URL so the organization is stamped.',
    );
    return;
  }

  console.log(
    `[otel] exporting web traces+metrics+logs as protobuf for service="${serviceName}" → ${ingestBase}`,
  );

  const environment = deploymentEnvironment(
    process.env.DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV,
  );
  const hostName =
    process.env.K_REVISION?.trim() ||
    usableHost(process.env.HOSTNAME) ||
    usableHost(hostname()) ||
    'unknown';

  const traceExporter = new OTLPTraceExporter({ url: tracesUrl, headers });
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'deployment.environment': environment,
      'service.version': process.env.OTEL_SERVICE_VERSION?.trim() || 'unknown',
      'host.name': hostName,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: metricsUrl, headers }),
        exportIntervalMillis: 15000,
      }),
    ],
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: logsUrl, headers }),
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        ...disabledInstrumentations(UNUSED_OR_NOISY_INSTRUMENTATIONS),
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request: IncomingMessage) =>
            isNoisePath(request.url),
          ignoreOutgoingRequestHook: (request: RequestOptions) =>
            isIngestHost(request, ingestBase),
        },
        '@opentelemetry/instrumentation-undici': {
          ignoreRequestHook: (request) => isIngestOrigin(request.origin, ingestBase),
        },
        '@opentelemetry/instrumentation-pg': {
          ignoreConnectSpans: true,
          enhancedDatabaseReporting: false,
          requireParentSpan: true,
        },
        '@opentelemetry/instrumentation-host-metrics': {
          metricGroups: [
            'system.cpu',
            'system.memory',
            'system.network',
            'process.cpu',
            'process.memory',
          ],
        },
        '@opentelemetry/instrumentation-winston': {
          logSeverity: SeverityNumber.INFO,
        },
      }),
    ],
  });

  sdk.start();
  patchConsoleToOtel(serviceName);

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .catch((err) => console.error('[otel] shutdown error', err))
      .finally(() => process.exit(0));
  });
}

const UNUSED_OR_NOISY_INSTRUMENTATIONS = [
  '@opentelemetry/instrumentation-amqplib',
  '@opentelemetry/instrumentation-aws-lambda',
  '@opentelemetry/instrumentation-aws-sdk',
  '@opentelemetry/instrumentation-bunyan',
  '@opentelemetry/instrumentation-cassandra-driver',
  '@opentelemetry/instrumentation-connect',
  '@opentelemetry/instrumentation-cucumber',
  '@opentelemetry/instrumentation-dataloader',
  '@opentelemetry/instrumentation-dns',
  '@opentelemetry/instrumentation-express',
  '@opentelemetry/instrumentation-fs',
  '@opentelemetry/instrumentation-generic-pool',
  '@opentelemetry/instrumentation-graphql',
  '@opentelemetry/instrumentation-grpc',
  '@opentelemetry/instrumentation-hapi',
  '@opentelemetry/instrumentation-ioredis',
  '@opentelemetry/instrumentation-kafkajs',
  '@opentelemetry/instrumentation-knex',
  '@opentelemetry/instrumentation-koa',
  '@opentelemetry/instrumentation-lru-memoizer',
  '@opentelemetry/instrumentation-memcached',
  '@opentelemetry/instrumentation-mongodb',
  '@opentelemetry/instrumentation-mongoose',
  '@opentelemetry/instrumentation-mysql',
  '@opentelemetry/instrumentation-mysql2',
  '@opentelemetry/instrumentation-net',
  '@opentelemetry/instrumentation-openai',
  '@opentelemetry/instrumentation-oracledb',
  '@opentelemetry/instrumentation-pino',
  '@opentelemetry/instrumentation-redis',
  '@opentelemetry/instrumentation-restify',
  '@opentelemetry/instrumentation-router',
  '@opentelemetry/instrumentation-socket.io',
  '@opentelemetry/instrumentation-tedious',
] as const;

function disabledInstrumentations(
  names: readonly string[],
): Record<string, { enabled: false }> {
  return Object.fromEntries(names.map((name) => [name, { enabled: false }]));
}

function isNoisePath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0];
  return (
    path.startsWith('/_next/static') ||
    path.startsWith('/_next/image') ||
    path === '/favicon.ico' ||
    path === '/sw.js' ||
    path.startsWith('/workbox') ||
    path === '/api/health'
  );
}

function isIngestHost(request: RequestOptions, ingestBase: string): boolean {
  const host = request.hostname || request.host || '';
  return host.split(':')[0] === hostnameOf(ingestBase);
}

function isIngestOrigin(origin: string | undefined, ingestBase: string): boolean {
  const ingestHost = hostnameOf(ingestBase);
  if (!origin || !ingestHost) return false;
  try {
    return new URL(origin).hostname === ingestHost;
  } catch {
    return origin.includes(ingestHost);
  }
}

function hostnameOf(ingestBase: string): string {
  try {
    return new URL(ingestBase).hostname;
  } catch {
    return '';
  }
}

function deploymentEnvironment(raw: string | undefined): string {
  const value = raw?.trim().toLowerCase() || 'development';
  if (value === 'production' || value === 'prod') return 'prod';
  if (value === 'staging') return 'staging';
  if (value === 'demo') return 'demo';
  if (value === 'development' || value === 'dev') return 'development';
  return value;
}

function usableHost(value: string | undefined): string | undefined {
  const host = value?.trim();
  if (!host || host === 'localhost' || host === '0.0.0.0') return undefined;
  return host;
}

function patchConsoleToOtel(name: string): void {
  const otelLogger = logs.getLogger(name);
  for (const method of ['warn', 'error'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      try {
        otelLogger.emit({
          body: args
            .map((part) => (typeof part === 'string' ? part : safeStringify(part)))
            .join(' '),
          severityNumber:
            method === 'error' ? SeverityNumber.ERROR : SeverityNumber.WARN,
          severityText: method.toUpperCase(),
          attributes: { 'code.function': `console.${method}` },
        });
      } catch {
        // never break logging if OTel emit fails
      }
      original(...args);
    };
  }
}

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === 'object' && value !== null) return JSON.stringify(value);
    return String(value);
  } catch {
    return '';
  }
}

const globalState = globalThis as { __locumlinkWebOtel?: boolean };
if (!globalState.__locumlinkWebOtel) {
  globalState.__locumlinkWebOtel = true;
  startWebTelemetry();
}
