const COLLECTOR_PORTS = new Set(['4317', '4318']);

/** Helix stamps the organization from this header. Do not send an organization id. */
export const HELIX_API_KEY_HEADER = 'X-Helix-Api-Key';

export function ingestionKey(env: Record<string, string | undefined>): string {
  return (
    env.HELIX_INGESTION_KEY?.trim() ||
    env.HOLOTRACER_INGESTION_KEY?.trim() ||
    ''
  );
}

export function ingestBaseUrl(env: Record<string, string | undefined>): string {
  return (
    env.HELIX_INGEST_BASE?.trim() ||
    env.HOLOTRACER_INGEST_BASE?.trim() ||
    'http://142.93.144.9/api/v1/ingest'
  );
}

export function signalUrl(
  base: string,
  signal: 'traces' | 'logs' | 'metrics',
  override?: string,
): string {
  const explicit = override?.trim();
  if (explicit) return explicit;
  return `${base.replace(/\/$/, '')}/v1/${signal}`;
}

/** Collector ports are internal. Traffic that skips ingest is not stamped to an org. */
export function isCollectorEndpoint(url: string): boolean {
  try {
    return COLLECTOR_PORTS.has(new URL(url).port);
  } catch {
    return false;
  }
}

export function helixHeaders(key: string): Record<string, string> {
  if (!key) return {};
  return { [HELIX_API_KEY_HEADER]: key };
}
