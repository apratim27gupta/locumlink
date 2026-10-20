import { SpanStatusCode } from '@opentelemetry/api';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { Context } from '@opentelemetry/api';
import {
  isExpectedClientFailure,
  shouldDropSpan,
  type SpanView,
} from './signal-policy.js';

/** Drops low-signal spans and clears expected client exceptions before export. */
export class SignalSpanProcessor implements SpanProcessor {
  constructor(private readonly inner: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const view = toSpanView(span);
    if (shouldDropSpan(view)) return;
    this.inner.onEnd(
      isExpectedClientFailure(view) ? withoutException(span) : span,
    );
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}

function toSpanView(span: ReadableSpan): SpanView {
  return {
    name: span.name,
    attributes: span.attributes as Record<string, unknown>,
    events: span.events.map((event) => ({
      name: event.name,
      attributes: event.attributes as Record<string, unknown> | undefined,
    })),
  };
}

function withoutException(span: ReadableSpan): ReadableSpan {
  return new Proxy(span, {
    get(target, prop): unknown {
      if (prop === 'status') return { code: SpanStatusCode.UNSET };
      if (prop === 'events') {
        return target.events.filter((event) => event.name !== 'exception');
      }
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return function bound(this: unknown, ...args: unknown[]): unknown {
          return Reflect.apply(value, target, args) as unknown;
        };
      }
      return value;
    },
  });
}
