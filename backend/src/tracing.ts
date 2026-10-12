import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';

// Nest ConfigModule loads .env later — OTel must see the key before sdk.start().
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), 'backend/.env') });
loadEnv({ path: resolve(process.cwd(), '../.env') });

const key = process.env.HOLOTRACER_INGESTION_KEY?.trim();
const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'locumlink-api';
const ingestBase =
  process.env.HOLOTRACER_INGEST_BASE?.trim() ||
  'http://142.93.144.9/api/v1/ingest';

const headers: Record<string, string> = {
  'X-HoloTracer-Api-Key': key || '',
};

const tracesUrl =
  process.env.HOLOTRACER_TRACES_URL?.trim() || `${ingestBase}/v1/traces`;
const metricsUrl =
  process.env.HOLOTRACER_METRICS_URL?.trim() || `${ingestBase}/v1/metrics`;
const logsUrl =
  process.env.HOLOTRACER_LOGS_URL?.trim() || `${ingestBase}/v1/logs`;

if (!key) {
  console.warn(
    '[otel] HOLOTRACER_INGESTION_KEY missing — traces/logs/metrics will not export',
  );
} else {
  console.log(
    `[otel] exporting traces+metrics+logs as service="${serviceName}" → ${ingestBase}`,
  );
}

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({
    url: tracesUrl,
    headers,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: metricsUrl,
      headers,
    }),
    exportIntervalMillis: 15000,
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({
        url: logsUrl,
        headers,
      }),
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
    // Path 2: Winston (AppLoggerService / HttpLoggingInterceptor)
    new WinstonInstrumentation({
      disableLogSending: false,
    }),
  ],
});

sdk.start();

// Path 3: ad-hoc console.log / console.warn / console.error
patchConsoleToOtel(serviceName);

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .catch((err) => console.error('[otel] shutdown error', err))
    .finally(() => process.exit(0));
});

function patchConsoleToOtel(name: string) {
  const otelLogger = logs.getLogger(name);
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
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

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return value.stack || value.message;
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}
