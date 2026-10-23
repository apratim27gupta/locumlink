import {
  AggregationType,
  type ViewOptions,
} from '@opentelemetry/sdk-metrics';

/** Meters created by auto-instrumentation. Traces from these packages stay. */
const AUTO_METRIC_METERS = [
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-undici',
  '@opentelemetry/instrumentation-pg',
  '@opentelemetry/instrumentation-runtime-node',
  '@opentelemetry/instrumentation-host-metrics',
] as const;

export function dropAutoInstrumentationMetrics(): ViewOptions[] {
  return AUTO_METRIC_METERS.map((meterName) => ({
    meterName,
    instrumentName: '*',
    aggregation: { type: AggregationType.DROP },
  }));
}
