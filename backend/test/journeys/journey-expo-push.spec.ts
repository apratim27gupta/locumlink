import type { INestApplication } from '@nestjs/common';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from '../setup/test-app';
import { cleanupTables, getTestDb } from '../helpers/db';
import { authedAgent } from '../helpers/http';
import { createLocumUser } from '../factories/user.factory';
import { PushService } from '../../src/notifications/push.service.js';

describe('Expo push tokens', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  afterEach(async () => {
    await cleanupTables();
  });

  it('registers and unregisters an Expo push token', async () => {
    const locum = await createLocumUser();
    const http = authedAgent(ctx.agent, locum.token);
    const token = 'ExponentPushToken[integration-test-token]';

    await http
      .post('/api/notifications/push/register-expo', {
        token,
        platform: 'ios',
      })
      .expect(201);

    const db = getTestDb();
    const row = await db.expoPushToken.findUnique({ where: { token } });
    expect(row).toMatchObject({
      userId: locum.user.id,
      platform: 'ios',
    });

    await ctx.agent
      .delete('/api/notifications/push/unregister-expo')
      .set('Authorization', `Bearer ${locum.token}`)
      .send({ token })
      .expect(200);

    const gone = await db.expoPushToken.findUnique({ where: { token } });
    expect(gone).toBeNull();
  });

  it('sendExpoToUser posts to Expo Push API', async () => {
    const locum = await createLocumUser();
    const db = getTestDb();
    const expoToken = 'ExponentPushToken[send-test]';
    await db.expoPushToken.create({
      data: {
        userId: locum.user.id,
        token: expoToken,
        platform: 'ios',
      },
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      const pushService = app.get(PushService);
      await pushService.sendExpoToUser(locum.user.id, {
        title: 'Test',
        body: 'Hello',
        url: '/locum/messages',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://exp.host/--/api/v2/push/send');
      const body = JSON.parse(String(init.body)) as Array<{
        to: string;
        title: string;
        body: string;
        data: { url: string };
      }>;
      expect(body[0]).toMatchObject({
        to: expoToken,
        title: 'Test',
        body: 'Hello',
        data: { url: '/locum/messages' },
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
