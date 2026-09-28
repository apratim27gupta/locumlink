import type { INestApplication } from '@nestjs/common';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from '../setup/test-app';
import { cleanupTables, getTestDb } from '../helpers/db';
import { authedAgent } from '../helpers/http';
import { createHostUser, createLocumUser } from '../factories/user.factory';
import { createJobPosting } from '../factories/job.factory';
import { PostingStatus } from '@prisma/client';

describe('Journey 5 — Notifications after application', () => {
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

  it('creates notification for host after locum applies, supports read/unread filters', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const job = await createJobPosting(host.hostProfileId, {
      status: PostingStatus.ACTIVE,
      title: 'Notify Test Job',
    });

    const locumHttp = authedAgent(ctx.agent, locum.token);
    await locumHttp
      .post(`/api/locum/jobs/${job.id}/apply`, { coverNote: 'Please review' })
      .expect(201);

    const db = getTestDb();
    const notifRow = await db.notificationEvent.findFirst({
      where: {
        recipientId: host.user.id,
        eventType: 'H_001_LOCUM_APPLIED',
      },
    });
    expect(notifRow).not.toBeNull();
    expect(notifRow?.deliveryStatus).not.toBe('READ');

    const locumNotif = await db.notificationEvent.findFirst({
      where: {
        recipientId: locum.user.id,
        eventType: 'L_015_APPLICATION_SUBMITTED',
      },
    });
    expect(locumNotif).not.toBeNull();
    expect(locumNotif?.payload).toEqual(
      expect.objectContaining({
        title: 'Application Submitted',
        href: '/locum/dashboard',
      }),
    );

    const hostHttp = authedAgent(ctx.agent, host.token);

    const all = await hostHttp.get('/api/notifications').expect(200);
    expect(all.body).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        nextCursor: expect.anything(),
        hasNextPage: expect.any(Boolean),
      }),
    );
    expect(all.body.items.length).toBeGreaterThanOrEqual(1);
    const notif = all.body.items.find(
      (n: { id: string }) => n.id === notifRow?.id,
    );
    expect(notif).toEqual(
      expect.objectContaining({
        id: notifRow?.id,
        read: false,
        title: expect.any(String),
        body: expect.any(String),
        href: expect.any(String),
        createdAt: expect.any(String),
      }),
    );

    const unread = await hostHttp
      .get('/api/notifications?unreadOnly=true')
      .expect(200);
    expect(
      unread.body.items.some((n: { id: string }) => n.id === notifRow?.id),
    ).toBe(true);

    await hostHttp
      .patch(`/api/notifications/${notifRow!.id}/read`)
      .expect(200);

    const updated = await db.notificationEvent.findUnique({
      where: { id: notifRow!.id },
    });
    expect(updated?.deliveryStatus).toBe('READ');

    const unreadAfter = await hostHttp
      .get('/api/notifications?unreadOnly=true')
      .expect(200);
    expect(
      unreadAfter.body.items.some((n: { id: string }) => n.id === notifRow?.id),
    ).toBe(false);
  });
});
