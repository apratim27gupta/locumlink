import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { withAgentSpan, withModelSpan, withToolSpan } from './llm-spans.js';

describe('llm spans', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(() => {
    exporter.reset();
  });

  afterAll(() => {
    trace.disable();
    context.disable();
  });

  it('puts model, tool, and agent spans on the request trace', async () => {
    await trace
      .getTracer('test')
      .startActiveSpan('GET /api/assist', async (root) => {
        await withAgentSpan(
          { name: 'shift-assistant', conversationId: 'conv-1' },
          async () => {
            await withModelSpan(
              {
                provider: 'openai',
                model: 'gpt-4o',
                prompt: 'Who is on tonight?',
                conversationId: 'conv-1',
              },
              () => ({
                completion: 'Two locums.',
                inputTokens: 12,
                outputTokens: 4,
                cacheReadInputTokens: 3,
                timeToFirstTokenMs: 180,
                cost: 0.002,
              }),
            );
            await withToolSpan(
              { name: 'lookup_schedule', arguments: { night: '2026-10-19' } },
              () => ({ locums: ['Ada'] }),
            );
            return 'Two locums.';
          },
        );
        root.end();
      });

    const spans = exporter.getFinishedSpans();
    const root = spans.find((span) => span.name === 'GET /api/assist');
    const agent = spans.find(
      (span) => span.name === 'invoke_agent shift-assistant',
    );
    const model = spans.find((span) => span.name === 'chat gpt-4o');
    const tool = spans.find(
      (span) => span.name === 'execute_tool lookup_schedule',
    );

    expect(root).toBeDefined();
    expect(agent?.spanContext().traceId).toBe(root?.spanContext().traceId);
    expect(model?.spanContext().traceId).toBe(root?.spanContext().traceId);
    expect(tool?.spanContext().traceId).toBe(root?.spanContext().traceId);
    expect(model?.parentSpanContext?.spanId).toBe(agent?.spanContext().spanId);
    expect(tool?.parentSpanContext?.spanId).toBe(agent?.spanContext().spanId);

    expect(model?.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(model?.attributes['gen_ai.system']).toBe('openai');
    expect(model?.attributes['gen_ai.usage.input_tokens']).toBe(12);
    expect(model?.attributes['gen_ai.usage.output_tokens']).toBe(4);
    expect(model?.attributes['gen_ai.usage.cache_read.input_tokens']).toBe(3);
    expect(model?.attributes['gen_ai.server.ttft']).toBe(180);
    expect(model?.attributes['gen_ai.prompt']).toBe('Who is on tonight?');
    expect(model?.attributes['gen_ai.completion']).toBe('Two locums.');
    expect(model?.attributes['gen_ai.usage.cost']).toBe(0.002);

    expect(tool?.attributes['gen_ai.tool.name']).toBe('lookup_schedule');
    expect(tool?.attributes['gen_ai.tool.call.arguments']).toBe(
      '{"night":"2026-10-19"}',
    );
    expect(tool?.attributes['gen_ai.tool.call.result']).toBe(
      '{"locums":["Ada"]}',
    );
    expect(agent?.attributes['gen_ai.agent.name']).toBe('shift-assistant');
    expect(agent?.attributes['gen_ai.agent.result']).toBe('Two locums.');
  });

  it('marks a failed model span with an error status and error type', async () => {
    await expect(
      withModelSpan({ provider: 'openai', model: 'gpt-4o' }, () => {
        throw Object.assign(new Error('rate limited'), {
          name: 'RateLimitError',
        });
      }),
    ).rejects.toThrow('rate limited');

    const span = exporter
      .getFinishedSpans()
      .find((item) => item.name === 'chat gpt-4o');
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.attributes['gen_ai.error.type']).toBe('RateLimitError');
    expect(span?.attributes['gen_ai.request.model']).toBe('gpt-4o');
  });
});
