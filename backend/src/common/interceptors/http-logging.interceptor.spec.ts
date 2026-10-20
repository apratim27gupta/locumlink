import { httpAccessMessage } from './http-logging.interceptor.js';

describe('http access log line', () => {
  it('includes method, path, status, duration, and user', () => {
    expect(
      httpAccessMessage({
        method: 'GET',
        path: '/api/messages/conversations',
        statusCode: 200,
        durationMs: 18,
        userId: 'user-1',
      }),
    ).toBe('GET /api/messages/conversations 200 18ms user=user-1');
  });

  it('omits a missing user and keeps the error on the same line', () => {
    expect(
      httpAccessMessage({
        method: 'POST',
        path: '/api/auth/login',
        statusCode: 401,
        durationMs: 8,
        userId: null,
        error: 'Invalid credentials\n',
      }),
    ).toBe('POST /api/auth/login 401 8ms Invalid credentials');
  });
});
