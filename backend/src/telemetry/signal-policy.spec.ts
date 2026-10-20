import {
  isExpectedClientFailure,
  isProbePath,
  shouldDropSpan,
} from './signal-policy.js';

describe('telemetry signal policy', () => {
  it('treats health probes as paths to skip', () => {
    expect(isProbePath('/api/health')).toBe(true);
    expect(isProbePath('/api/health?ready=1')).toBe(true);
    expect(isProbePath('/health/')).toBe(true);
    expect(isProbePath('/api/locum/jobs')).toBe(false);
  });

  it('drops framework noise and keeps request, controller, and query spans', () => {
    expect(shouldDropSpan({ name: 'middleware - patched' })).toBe(true);
    expect(shouldDropSpan({ name: 'pg.connect' })).toBe(true);
    expect(shouldDropSpan({ name: 'pg-pool.connect' })).toBe(true);
    expect(shouldDropSpan({ name: 'ipc.connect' })).toBe(true);
    expect(
      shouldDropSpan({
        name: 'Create Nest App',
        attributes: { 'nestjs.type': 'app_creation' },
      }),
    ).toBe(true);
    expect(
      shouldDropSpan({
        name: 'browseJobsCount',
        attributes: { 'nestjs.type': 'handler' },
      }),
    ).toBe(true);
    expect(
      shouldDropSpan({
        name: 'GET /api/health',
        attributes: { 'url.path': '/api/health' },
      }),
    ).toBe(true);

    expect(
      shouldDropSpan({
        name: 'GET /api/locum/jobs/browse-count',
        attributes: { 'http.route': '/api/locum/jobs/browse-count' },
      }),
    ).toBe(false);
    expect(
      shouldDropSpan({
        name: 'LocumController.browseJobsCount',
        attributes: { 'nestjs.type': 'request_context' },
      }),
    ).toBe(false);
    expect(shouldDropSpan({ name: 'pg.query' })).toBe(false);
    expect(
      shouldDropSpan({
        name: 'pg.query',
        attributes: { 'db.query.text': 'SELECT 1' },
      }),
    ).toBe(true);
  });

  it('treats expected client exceptions as non-failures and keeps server faults', () => {
    expect(
      isExpectedClientFailure({
        name: 'HostController.getProfile',
        events: [
          {
            name: 'exception',
            attributes: {
              'exception.type': 'UnauthorizedException',
              'exception.message': 'Unauthorized',
            },
          },
        ],
      }),
    ).toBe(true);

    expect(
      isExpectedClientFailure({
        name: 'LocumController.browseJobsCount',
        attributes: { 'http.response.status_code': 500 },
        events: [
          {
            name: 'exception',
            attributes: {
              'exception.type': 'P2010',
              'exception.message': 'Database not reachable',
            },
          },
        ],
      }),
    ).toBe(false);
  });

});
