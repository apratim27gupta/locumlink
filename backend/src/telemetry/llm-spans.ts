import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api';

/**
 * Child spans for Helix LLM Observability.
 *
 * Call these inside the request that already has the HTTP server span.
 * They join that trace. Helix counts model turns from spans that carry
 * gen_ai.request.model. Time to first token is milliseconds.
 */

const tracer = () => trace.getTracer('locumlink-api');

export type ModelCallResult = {
  completion?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  /** Milliseconds from provider request start until the first token. */
  timeToFirstTokenMs?: number;
  /** Sent as gen_ai.usage.cost. Helix overview total cost sums this and nothing else. */
  cost?: number;
};

export type ModelCallInput = {
  provider: string;
  model: string;
  prompt?: string;
  conversationId?: string;
};

export async function withModelSpan<T extends ModelCallResult>(
  input: ModelCallInput,
  run: () => Promise<T> | T,
): Promise<T> {
  return tracer().startActiveSpan(`chat ${input.model}`, async (span) => {
    span.setAttributes(
      definedAttributes({
        'gen_ai.system': input.provider,
        'gen_ai.request.model': input.model,
        'gen_ai.prompt': input.prompt,
        'gen_ai.conversation.id': input.conversationId,
      }),
    );
    try {
      const result = await run();
      span.setAttributes(
        definedAttributes({
          'gen_ai.completion': result.completion,
          'gen_ai.usage.input_tokens': result.inputTokens,
          'gen_ai.usage.output_tokens': result.outputTokens,
          'gen_ai.usage.cache_read.input_tokens': result.cacheReadInputTokens,
          'gen_ai.usage.cache_creation.input_tokens':
            result.cacheCreationInputTokens,
          'gen_ai.server.ttft': result.timeToFirstTokenMs,
          'gen_ai.usage.cost': result.cost,
        }),
      );
      return result;
    } catch (err) {
      failSpan(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function withToolSpan<T>(
  input: { name: string; arguments?: unknown; conversationId?: string },
  run: () => Promise<T> | T,
): Promise<T> {
  return tracer().startActiveSpan(
    `execute_tool ${input.name}`,
    async (span) => {
      span.setAttributes(
        definedAttributes({
          'gen_ai.tool.name': input.name,
          'gen_ai.tool.call.arguments': stringifyAttribute(input.arguments),
          'gen_ai.conversation.id': input.conversationId,
        }),
      );
      try {
        const result = await run();
        const rendered = stringifyAttribute(result);
        if (rendered !== undefined) {
          span.setAttribute('gen_ai.tool.call.result', rendered);
        }
        return result;
      } catch (err) {
        failSpan(span, err);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export async function withAgentSpan<T>(
  input: { name: string; conversationId?: string },
  run: () => Promise<T> | T,
  resultText?: (value: T) => string,
): Promise<T> {
  return tracer().startActiveSpan(
    `invoke_agent ${input.name}`,
    async (span) => {
      span.setAttributes(
        definedAttributes({
          'gen_ai.agent.name': input.name,
          'gen_ai.conversation.id': input.conversationId,
        }),
      );
      try {
        const result = await run();
        const rendered = resultText
          ? resultText(result)
          : stringifyAttribute(result);
        if (rendered !== undefined) {
          span.setAttribute('gen_ai.agent.result', rendered);
        }
        return result;
      } catch (err) {
        failSpan(span, err);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

function failSpan(span: Span, err: unknown): void {
  const type = err instanceof Error && err.name ? err.name : 'Error';
  const message = err instanceof Error ? err.message : type;
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.setAttribute('gen_ai.error.type', type);
}

function definedAttributes(
  values: Record<string, string | number | undefined>,
): Attributes {
  const attributes: Attributes = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) attributes[key] = value;
  }
  return attributes;
}

function stringifyAttribute(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value.toString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
