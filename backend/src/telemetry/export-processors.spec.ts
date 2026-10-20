import type { LogRecordProcessor, ReadWriteLogRecord } from '@opentelemetry/sdk-logs';
import {
  SeverityTextProcessor,
  canonicalSeverityText,
} from './export-processors.js';

describe('severity text', () => {
  it('uppercases winston levels and leaves Nest levels unchanged', () => {
    expect(canonicalSeverityText('info')).toBe('INFO');
    expect(canonicalSeverityText('warn')).toBe('WARN');
    expect(canonicalSeverityText('INFO')).toBe('INFO');
    expect(canonicalSeverityText(undefined)).toBeUndefined();
  });

  it('rewrites the record before export', () => {
    let seen: string | undefined;
    const inner: LogRecordProcessor = {
      onEmit(record) {
        seen = record.severityText;
      },
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    const record = {
      severityText: 'info',
      setSeverityText(value: string) {
        this.severityText = value;
        return this;
      },
    } as ReadWriteLogRecord;

    new SeverityTextProcessor(inner).onEmit(record);

    expect(record.severityText).toBe('INFO');
    expect(seen).toBe('INFO');
  });
});
