import type { INestApplication } from '@nestjs/common';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from '../setup/test-app';
import { cleanupTables, getTestDb } from '../helpers/db';
import { authedAgent } from '../helpers/http';
import { createHostUser, createLocumUser } from '../factories/user.factory';

describe('Journey — Messaging report (host ↔ locum)', () => {
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

  it('submits a report without blocking', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    const res = await hostHttp
      .post('/api/messages/reports', {
        userId: locum.user.id,
        reason: 'HARASSMENT',
        details: 'Repeated abusive messages',
      })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ ok: true, blocked: false }),
    );

    const row = await getTestDb().userReport.findFirst({
      where: { reporterId: host.user.id, reportedId: locum.user.id },
    });
    expect(row).toEqual(
      expect.objectContaining({
        reason: 'HARASSMENT',
        details: 'Repeated abusive messages',
        alsoBlockedReporter: false,
        status: 'OPEN',
      }),
    );
  });

  it('blocks and reports atomically', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);
    const locumHttp = authedAgent(ctx.agent, locum.token);

    await hostHttp
      .post('/api/messages/reports', {
        userId: locum.user.id,
        reason: 'SPAM',
        block: true,
      })
      .expect(200);

    const [report, block] = await Promise.all([
      getTestDb().userReport.findFirst({
        where: { reporterId: host.user.id, reportedId: locum.user.id },
      }),
      getTestDb().userBlock.findFirst({
        where: { blockerId: host.user.id, blockedId: locum.user.id },
      }),
    ]);
    expect(report?.alsoBlockedReporter).toBe(true);
    expect(block).not.toBeNull();

    await locumHttp
      .post('/api/messages', {
        recipientId: host.user.id,
        body: 'Blocked attempt',
      })
      .expect(403);
  });

  it('deduplicates open reports for the same pair', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    await hostHttp
      .post('/api/messages/reports', {
        userId: locum.user.id,
        reason: 'OTHER',
      })
      .expect(200);

    await hostHttp
      .post('/api/messages/reports', {
        userId: locum.user.id,
        reason: 'FRAUD',
      })
      .expect(409);
  });

  it('cannot report yourself', async () => {
    const host = await createHostUser();
    const hostHttp = authedAgent(ctx.agent, host.token);

    await hostHttp
      .post('/api/messages/reports', {
        userId: host.user.id,
        reason: 'OTHER',
      })
      .expect(400);
  });
});
