import type { INestApplication } from '@nestjs/common';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from '../setup/test-app';
import { cleanupTables, getTestDb } from '../helpers/db';
import { authedAgent } from '../helpers/http';
import { createHostUser, createLocumUser } from '../factories/user.factory';

describe('Journey — Messaging block (host ↔ locum)', () => {
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

  it('host blocks locum → neither can send messages until unblock', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);
    const locumHttp = authedAgent(ctx.agent, locum.token);

    await hostHttp
      .post('/api/messages/blocks', { userId: locum.user.id })
      .expect(200);

    await locumHttp
      .post('/api/messages', {
        recipientId: host.user.id,
        body: 'Hello host',
      })
      .expect(403);

    await hostHttp
      .post('/api/messages', {
        recipientId: locum.user.id,
        body: 'Hello locum',
      })
      .expect(403);

    await hostHttp
      .delete(`/api/messages/blocks/${locum.user.id}`)
      .expect(200);

    await locumHttp
      .post('/api/messages', {
        recipientId: host.user.id,
        body: 'Hello again',
      })
      .expect(200);

    await hostHttp
      .post('/api/messages', {
        recipientId: locum.user.id,
        body: 'Reply',
      })
      .expect(200);
  });

  it('locum blocks host → neither can send messages', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);
    const locumHttp = authedAgent(ctx.agent, locum.token);

    await locumHttp
      .post('/api/messages/blocks', { userId: host.user.id })
      .expect(200);

    await hostHttp
      .post('/api/messages', {
        recipientId: locum.user.id,
        body: 'Blocked attempt',
      })
      .expect(403);

    await locumHttp
      .post('/api/messages', {
        recipientId: host.user.id,
        body: 'Also blocked',
      })
      .expect(403);
  });

  it('GET thread returns blockStatus', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    await hostHttp
      .post('/api/messages/blocks', { userId: locum.user.id })
      .expect(200);

    const res = await hostHttp
      .get(`/api/messages/thread/${locum.user.id}`)
      .expect(200);

    expect(res.body.blockStatus).toEqual({
      blockedByMe: true,
      blockedByPartner: false,
      isMessagingBlocked: true,
    });
  });

  it('GET conversations includes blockStatus per partner', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    await hostHttp
      .post('/api/messages', {
        recipientId: locum.user.id,
        body: 'First message',
      })
      .expect(200);

    await hostHttp
      .post('/api/messages/blocks', { userId: locum.user.id })
      .expect(200);

    const res = await hostHttp.get('/api/messages/conversations').expect(200);

    expect(res.body.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnerId: locum.user.id,
          blockStatus: {
            blockedByMe: true,
            blockedByPartner: false,
            isMessagingBlocked: true,
          },
        }),
      ]),
    );
  });

  it('cannot block yourself', async () => {
    const host = await createHostUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    await hostHttp
      .post('/api/messages/blocks', { userId: host.user.id })
      .expect(400);
  });

  it('unblock returns 404 when not blocked', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    await hostHttp
      .delete(`/api/messages/blocks/${locum.user.id}`)
      .expect(404);
  });

  it('GET blocks lists blocked users', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    await hostHttp
      .post('/api/messages/blocks', { userId: locum.user.id })
      .expect(200);

    const res = await hostHttp.get('/api/messages/blocks').expect(200);

    expect(res.body.blockedUsers).toEqual([
      expect.objectContaining({
        userId: locum.user.id,
        user: expect.objectContaining({ id: locum.user.id }),
      }),
    ]);

    const row = await getTestDb().userBlock.findFirst({
      where: { blockerId: host.user.id, blockedId: locum.user.id },
    });
    expect(row).not.toBeNull();
  });
});
