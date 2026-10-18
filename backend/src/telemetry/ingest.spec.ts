import {
  helixHeaders,
  ingestBaseUrl,
  ingestionKey,
  isCollectorEndpoint,
  signalUrl,
} from './ingest.js';

describe('helix ingest', () => {
  it('builds the three OTLP HTTP signal paths off the ingest URL', () => {
    const base = 'http://142.93.144.9/api/v1/ingest';
    expect(signalUrl(base, 'traces')).toBe(`${base}/v1/traces`);
    expect(signalUrl(base, 'logs')).toBe(`${base}/v1/logs`);
    expect(signalUrl(base, 'metrics')).toBe(`${base}/v1/metrics`);
  });

  it('refuses the internal collector ports', () => {
    expect(isCollectorEndpoint('http://142.93.144.9:4317')).toBe(true);
    expect(isCollectorEndpoint('http://127.0.0.1:4318/v1/traces')).toBe(true);
    expect(
      isCollectorEndpoint('http://142.93.144.9/api/v1/ingest/v1/traces'),
    ).toBe(false);
  });

  it('sends the ingestion key and no organization id', () => {
    expect(helixHeaders('secret')).toEqual({ 'X-Helix-Api-Key': 'secret' });
    expect(helixHeaders('secret')).not.toHaveProperty(
      'X-Helix-Organization-Id',
    );
  });

  it('reads the helix env names and keeps the existing holotracer names', () => {
    expect(
      ingestionKey({
        HELIX_INGESTION_KEY: 'new',
        HOLOTRACER_INGESTION_KEY: 'old',
      }),
    ).toBe('new');
    expect(ingestionKey({ HOLOTRACER_INGESTION_KEY: 'old' })).toBe('old');
    expect(
      ingestBaseUrl({ HOLOTRACER_INGEST_BASE: 'http://ingest.example' }),
    ).toBe('http://ingest.example');
  });
});
