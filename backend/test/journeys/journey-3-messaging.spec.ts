import type { INestApplication } from '@nestjs/common';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from '../setup/test-app';
import { cleanupTables, getTestDb } from '../helpers/db';
import { authedAgent } from '../helpers/http';
import { createHostUser, createLocumUser } from '../factories/user.factory';
import {
  createMessage,
  createMessageThread,
} from '../factories/message.factory';

describe('Journey 3 — Messaging between locum and host', () => {
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

  it('host sends a message → 200, sentAt persisted in DB', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const http = authedAgent(ctx.agent, host.token);

    const res = await http
      .post('/api/messages', {
        recipientId: locum.user.id,
        body: 'Hello from host',
      })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          id: expect.any(String),
          body: 'Hello from host',
          senderId: host.user.id,
          recipientId: locum.user.id,
          sentAt: expect.any(String),
        }),
      }),
    );

    const row = await getTestDb().message.findUnique({
      where: { id: res.body.message.id },
    });
    expect(row).not.toBeNull();
    expect(row?.sentAt).toBeInstanceOf(Date);
    expect(row?.body).toBe('Hello from host');
  });

  it('returns thread messages oldest-first for UI', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const base = Date.now();
    await createMessage({
      senderId: host.user.id,
      recipientId: locum.user.id,
      body: 'first',
      sentAt: new Date(base),
    });
    await createMessage({
      senderId: locum.user.id,
      recipientId: host.user.id,
      body: 'second',
      sentAt: new Date(base + 60_000),
    });
    await createMessage({
      senderId: host.user.id,
      recipientId: locum.user.id,
      body: 'third',
      sentAt: new Date(base + 120_000),
    });

    const http = authedAgent(ctx.agent, locum.token);
    const res = await http
      .get(`/api/messages/thread/${host.user.id}`)
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        nextCursor: expect.anything(),
        hasNextPage: expect.any(Boolean),
        partner: expect.objectContaining({ id: host.user.id }),
      }),
    );

    const bodies = res.body.items.map((m: { body: string }) => m.body);
    expect(bodies).toEqual(['first', 'second', 'third']);
  });

  it('returns nextCursor when more messages exist than limit', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    await createMessageThread(host.user.id, locum.user.id, 25);

    const http = authedAgent(ctx.agent, locum.token);
    const res = await http
      .get(`/api/messages/thread/${host.user.id}?limit=20`)
      .expect(200);

    expect(res.body.items).toHaveLength(20);
    expect(res.body.hasNextPage).toBe(true);
    expect(res.body.nextCursor).toEqual(expect.any(String));
  });

  it('excludes soft-deleted messages from the thread', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const kept = await createMessage({
      senderId: host.user.id,
      recipientId: locum.user.id,
      body: 'visible',
    });
    const deleted = await createMessage({
      senderId: host.user.id,
      recipientId: locum.user.id,
      body: 'gone',
      sentAt: new Date(Date.now() + 60_000),
    });
    await getTestDb().message.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    const http = authedAgent(ctx.agent, locum.token);
    const res = await http
      .get(`/api/messages/thread/${host.user.id}`)
      .expect(200);

    const ids = res.body.items.map((m: { id: string }) => m.id);
    expect(ids).toContain(kept.id);
    expect(ids).not.toContain(deleted.id);
  });

  it('does not expose partner profile for unrelated user IDs', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const stranger = await createLocumUser();

    const http = authedAgent(ctx.agent, host.token);
    const res = await http
      .get(`/api/messages/thread/${stranger.user.id}`)
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.partner).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(stranger.user.email);
  });

  it('returns partner profile when a conversation exists', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    await createMessage({
      senderId: host.user.id,
      recipientId: locum.user.id,
      body: 'hi',
    });

    const http = authedAgent(ctx.agent, host.token);
    const res = await http
      .get(`/api/messages/thread/${locum.user.id}`)
      .expect(200);

    expect(res.body.partner).toEqual(
      expect.objectContaining({ id: locum.user.id }),
    );
    expect(res.body.partner?.email).toBeUndefined();
  });
});
