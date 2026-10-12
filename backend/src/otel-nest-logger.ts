import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

/**
 * Nest ConsoleLogger that also emits OTLP log records so [Nest] LOG/ERROR
 * lines show up in holoTracer (Nest writes to stdout, not Winston).
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
    try {
      for (const message of messages) {
        this.otel.emit({
          body: typeof message === 'string' ? message : safeStringify(message),
          severityNumber: nestLevelToSeverity(logLevel),
          severityText: (logLevel ?? 'log').toUpperCase(),
          attributes: {
            'nestjs.context': context ?? 'Nest',
            'code.function': 'NestLogger',
          },
        });
      }
    } catch {
      // never break Nest logging if OTel emit fails
    }
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack);
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
    if (value instanceof Error) {
      return value.stack || value.message;
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}
