import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

/**
 * Nest ConsoleLogger. Stdout keeps every line. Helix only receives warn and
 * error, so startup route maps stay off the telemetry pipeline.
 */
export class OtelNestLogger extends ConsoleLogger {
  private readonly otel = logs.getLogger('nestjs');

  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    if (logLevel === 'warn' || logLevel === 'error' || logLevel === 'fatal') {
      try {
        for (const message of messages) {
          this.otel.emit({
            body:
              typeof message === 'string' ? message : safeStringify(message),
            severityNumber: nestLevelToSeverity(logLevel),
            severityText: logLevel.toUpperCase(),
            attributes: {
              'nestjs.context': context ?? 'Nest',
              'code.function': 'NestLogger',
            },
          });
        }
      } catch {
        // never break Nest logging if OTel emit fails
      }
    }
    super.printMessages(
      messages,
      context,
      logLevel,
      writeStreamType,
      errorStack,
    );
  }
}

function nestLevelToSeverity(
  level?: LogLevel,
): (typeof SeverityNumber)[keyof typeof SeverityNumber] {
  switch (level) {
    case 'error':
    case 'fatal':
      return SeverityNumber.ERROR;
    case 'warn':
      return SeverityNumber.WARN;
    case 'debug':
    case 'verbose':
      return SeverityNumber.DEBUG;
    default:
      return SeverityNumber.INFO;
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
