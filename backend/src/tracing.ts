import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { hostname } from 'node:os';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import {
  AggregationType,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  envDetector,
  osDetector,
  processDetector,
  resourceFromAttributes,
  serviceInstanceIdDetector,
} from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  SignalLogRecordProcessor,
  SignalSpanProcessor,
} from './telemetry/export-processors.js';
import {
  helixHeaders,
  ingestBaseUrl,
  ingestionKey,
  isCollectorEndpoint,
  signalUrl,
} from './telemetry/ingest.js';
import {
  deploymentEnvironment,
  hostNameFrom,
  serviceResourceAttributes,
} from './telemetry/resource.js';
import { isProbePath } from './telemetry/signal-policy.js';

// Nest ConfigModule loads .env later — OTel must see the key before sdk.start().
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), 'backend/.env') });
loadEnv({ path: resolve(process.cwd(), '../.env') });

const key = ingestionKey(process.env);
const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'locumlink-api';
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
const exportUrls = [tracesUrl, metricsUrl, logsUrl];
const sendingToCollector = exportUrls.some(isCollectorEndpoint);

if (!key) {
  console.warn(
    '[otel] HELIX_INGESTION_KEY missing — traces/logs/metrics will not export',
  );
} else if (sendingToCollector) {
  console.error(
    '[otel] refusing collector port 4317/4318. Send OTLP to the Helix ingest URL so the organization is stamped.',
  );
} else {
  console.log(
    `[otel] exporting traces+metrics+logs as protobuf for service="${serviceName}" → ${ingestBase}`,
  );
}

const exporting = Boolean(key) && !sendingToCollector;

const resource = resourceFromAttributes(
  serviceResourceAttributes({
    serviceName,
    environment: deploymentEnvironment(
      process.env.DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV,
    ),
    version: process.env.OTEL_SERVICE_VERSION?.trim() || 'unknown',
    hostName: hostNameFrom({
      hostname: hostname(),
      envHostname: process.env.HOSTNAME,
      podName: process.env.POD_NAME || process.env.K8S_POD_NAME,
      cloudRunRevision: process.env.K_REVISION,
    }),
    podName: process.env.POD_NAME || process.env.K8S_POD_NAME,
    podNamespace: process.env.POD_NAMESPACE || process.env.K8S_NAMESPACE_NAME,
  }),
);

/** Libraries this API does not use, plus spans that duplicate HTTP and Nest. */
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

const traceExporter = exporting
  ? new OTLPTraceExporter({ url: tracesUrl, headers })
  : undefined;

const sdk = new NodeSDK({
  resource,
  resourceDetectors: [
    envDetector,
    osDetector,
    processDetector,
    serviceInstanceIdDetector,
  ],
  views: [
    {
      instrumentName: 'http.server.request.duration',
      aggregation: { type: AggregationType.DROP },
    },
    {
      instrumentName: 'http.client.request.duration',
      aggregation: { type: AggregationType.DROP },
    },
  ],
  metricReaders: traceExporter
    ? [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: metricsUrl,
            headers,
          }),
          exportIntervalMillis: 15000,
        }),
      ]
    : [],
  spanProcessors: traceExporter
    ? [new SignalSpanProcessor(new BatchSpanProcessor(traceExporter))]
    : [],
  logRecordProcessors: exporting
    ? [
        new SignalLogRecordProcessor(
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: logsUrl,
              headers,
            }),
          }),
        ),
      ]
    : [],
  instrumentations: [
    getNodeAutoInstrumentations({
      ...disabledInstrumentations(UNUSED_OR_NOISY_INSTRUMENTATIONS),
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request: IncomingMessage) =>
          isProbePath(request.url ?? ''),
        ignoreOutgoingRequestHook: (request: RequestOptions) =>
          isIngestHost(request),
      },
      '@opentelemetry/instrumentation-pg': {
        ignoreConnectSpans: true,
        enhancedDatabaseReporting: false,
        requireParentSpan: true,
      },
      '@opentelemetry/instrumentation-undici': {
        ignoreRequestHook: (request) => isIngestOrigin(request.origin),
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

// Only console warnings and errors. Startup console.log stays on stdout.
patchConsoleToOtel(serviceName);

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .catch((err) => console.error('[otel] shutdown error', err))
    .finally(() => process.exit(0));
});

function patchConsoleToOtel(name: string) {
  const otelLogger = logs.getLogger(name);
  for (const method of ['warn', 'error'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      try {
        otelLogger.emit({
          body: args
            .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
            .join(' '),
          severityNumber: consoleMethodToSeverity(method),
          severityText: method.toUpperCase(),
          attributes: { 'code.function': `console.${method}` },
        });
      } catch {
        // ignore
      }
      original(...args);
    };
  }
}

function consoleMethodToSeverity(
  method: string,
): (typeof SeverityNumber)[keyof typeof SeverityNumber] {
  switch (method) {
    case 'error':
      return SeverityNumber.ERROR;
    case 'warn':
      return SeverityNumber.WARN;
    case 'debug':
      return SeverityNumber.DEBUG;
    default:
      return SeverityNumber.INFO;
  }
}

function disabledInstrumentations(
  names: readonly string[],
): Record<string, { enabled: false }> {
  return Object.fromEntries(names.map((name) => [name, { enabled: false }]));
}

const ingestHostname = (() => {
  try {
    return new URL(ingestBase).hostname;
  } catch {
    return '';
  }
})();

function isIngestHost(request: RequestOptions): boolean {
  const host = request.hostname || request.host || '';
  return host.split(':')[0] === ingestHostname;
}

function isIngestOrigin(origin: string | undefined): boolean {
  if (!origin || !ingestHostname) return false;
  try {
    return new URL(origin).hostname === ingestHostname;
  } catch {
    return origin.includes(ingestHostname);
  }
}

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || value.message;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value.toString();
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return '';
  } catch {
    return '';
  }
}
