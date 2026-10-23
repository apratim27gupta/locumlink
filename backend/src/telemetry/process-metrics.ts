import { statfsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import { metrics, type ObservableResult } from '@opentelemetry/api';

const FILESYSTEM_PATH = '/';

/**
 * CPU, memory, disk, and event-loop utilization for this process.
 * Called after the SDK starts so the meter is the exporting one.
 */
export function startProcessMetrics(meterName: string): void {
  const meter = metrics.getMeter(meterName);
  const cpu = meter.createObservableGauge('process.cpu.utilization', {
    description:
      'Share of CPU this process used since the last sample, from 0 to 1.',
    unit: '1',
  });
  const memory = meter.createObservableGauge('process.memory.usage', {
    description: 'Resident memory of this process.',
    unit: 'By',
  });
  const filesystem = meter.createObservableGauge('system.filesystem.usage', {
    description: 'Bytes used and bytes free on the writable filesystem.',
    unit: 'By',
  });
  const eventLoop = meter.createObservableGauge('nodejs.eventloop.utilization', {
    description: 'Fraction of time the event loop was busy, from 0 to 1.',
    unit: '1',
  });

  let previousCpu = process.cpuUsage();
  let previousAt = performance.now();
  let previousEventLoop = performance.eventLoopUtilization();
  const cpus = Math.max(1, availableParallelism());

  cpu.addCallback((result) => {
    const now = performance.now();
    const usage = process.cpuUsage(previousCpu);
    const elapsedMicros = Math.max(1, (now - previousAt) * 1000);
    previousCpu = process.cpuUsage();
    previousAt = now;
    const utilization = (usage.user + usage.system) / elapsedMicros / cpus;
    result.observe(Math.min(1, Math.max(0, utilization)));
  });

  memory.addCallback((result) => {
    result.observe(process.memoryUsage().rss);
  });

  filesystem.addCallback((result) => {
    observeFilesystem(result);
  });

  eventLoop.addCallback((result) => {
    const current = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(current, previousEventLoop);
    previousEventLoop = current;
    result.observe(delta.utilization);
  });
}

function observeFilesystem(result: ObservableResult): void {
  try {
    const stats = statfsSync(FILESYSTEM_PATH);
    const block = stats.bsize;
    const used = Math.max(0, stats.blocks - stats.bfree) * block;
    const free = stats.bavail * block;
    const attributes = { 'system.device': FILESYSTEM_PATH };
    result.observe(used, { ...attributes, 'system.filesystem.state': 'used' });
    result.observe(free, { ...attributes, 'system.filesystem.state': 'free' });
  } catch {
    // A platform without statfs skips the sample. The other gauges still export.
  }
}
