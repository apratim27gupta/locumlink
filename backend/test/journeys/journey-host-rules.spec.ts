import type { INestApplication } from '@nestjs/common';
import { ApplicationStatus, PostingStatus, Role, UserStatus, VerificationStatus } from '@prisma/client';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from '../setup/test-app';
import { cleanupTables, getTestDb } from '../helpers/db';
import { authedAgent } from '../helpers/http';
import { signAccessToken } from '../helpers/auth';
import { createHostUser, createLocumUser } from '../factories/user.factory';
import {
  buildCreateJobPayload,
  createJobPosting,
  futureCalendarDate,
} from '../factories/job.factory';
import { createApplication } from '../factories/application.factory';

describe('Journey - Host posting rules and linked CPSNS', () => {
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

  async function createPendingInvoice(host: { token: string; hostProfileId: string }) {
    const locum = await createLocumUser();
    const job = await createJobPosting(host.hostProfileId, {
      status: PostingStatus.ACTIVE,
      startDate: new Date(`${futureCalendarDate(30)}T00:00:00.000Z`),
      endDate: new Date(`${futureCalendarDate(31)}T00:00:00.000Z`),
      startTime: '08:00',
      endTime: '15:00',
    });
    const application = await createApplication({
      jobPostingId: job.id,
      locumProfileId: locum.locumProfileId,
      status: ApplicationStatus.APPLIED,
    });
    const hostHttp = authedAgent(ctx.agent, host.token);
    for (const status of ['SHORTLISTED', 'CONFIRMED']) {
      await hostHttp
        .patch(`/api/host/jobs/${job.id}/applications/${application.id}`, { status })
        .expect(200);
    }
    await authedAgent(ctx.agent, locum.token)
      .patch(`/api/locum/applications/${application.id}/respond`, { response: 'accept' })
      .expect(200);
    const invoice = await getTestDb().matchFeeInvoice.findUniqueOrThrow({
      where: { applicationId: application.id },
      include: { events: true },
    });
    return invoice;
  }

  it('blocks publishing only while a match fee is overdue, allows drafts, and unblocks after payment', async () => {
    const host = await createHostUser();
    const invoice = await createPendingInvoice(host);
    expect(invoice.status).toBe('PENDING');
    const invoicedEvent = invoice.events.find((e) => e.eventType === 'INVOICED');
    expect(invoicedEvent?.detail).toContain('(Full tier');

    const http = authedAgent(ctx.agent, host.token);
    await http
      .post('/api/host/jobs', buildCreateJobPayload({ saveAsDraft: false, status: 'ACTIVE' }))
      .expect(201);

    await getTestDb().matchFeeInvoice.update({
      where: { id: invoice.id },
      data: { status: 'OVERDUE' },
    });
    const blocked = await http
      .post('/api/host/jobs', buildCreateJobPayload({ saveAsDraft: false, status: 'ACTIVE' }))
      .expect(403);
    expect(blocked.body.message).toMatch(/overdue match fee/i);

    const draft = await http
      .post('/api/host/jobs', buildCreateJobPayload({ saveAsDraft: true }))
      .expect(201);
    await http
      .patch(`/api/host/jobs/${draft.body.job.id}`, { status: 'ACTIVE' })
      .expect(403);

    await http.post(`/api/host/match-fees/${invoice.id}/pay-mock`).expect(200);

    await http
      .patch(`/api/host/jobs/${draft.body.job.id}`, { status: 'ACTIVE' })
      .expect(200);
    await http
      .post('/api/host/jobs', buildCreateJobPayload({ saveAsDraft: false, status: 'ACTIVE' }))
      .expect(201);
  });

  it('pre-fills and auto-verifies CPSNS from the verified locum profile when creating a host profile', async () => {
    const db = getTestDb();
    const locum = await createLocumUser();
    await db.locumProfile.update({
      where: { id: locum.locumProfileId },
      data: { cpsnsId: '12345678' },
    });
    const hostUser = await db.user.create({
      data: {
        email: locum.user.email,
        role: Role.HOST,
        passwordHash: 'unused',
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });
    const http = authedAgent(ctx.agent, signAccessToken(hostUser.id, Role.HOST, hostUser.email));

    const linked = await http.get('/api/host/profile/linked-cpsns').expect(200);
    expect(linked.body).toEqual({ cpsnsNumber: '12345678', verified: true });

    await http
      .post('/api/host/profile', { clinicName: 'Linked Clinic', cpsnsNumber: '12345678' })
      .expect(200);
    const profile = await db.hostProfile.findUniqueOrThrow({ where: { userId: hostUser.id } });
    expect(profile.cpsnsVerificationStatus).toBe(VerificationStatus.VERIFIED);
    expect(profile.cpsnsVerifiedAt).not.toBeNull();
  });

  it('does not auto-verify when the number differs or the other profile is not verified', async () => {
    const db = getTestDb();
    const host = await createHostUser();
    await db.hostProfile.update({
      where: { id: host.hostProfileId },
      data: { cpsnsNumber: '87654321', cpsnsVerificationStatus: VerificationStatus.PENDING_REVIEW },
    });
    const locumUser = await db.user.create({
      data: {
        email: host.user.email,
        role: Role.LOCUM,
        passwordHash: 'unused',
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });
    const http = authedAgent(ctx.agent, signAccessToken(locumUser.id, Role.LOCUM, locumUser.email));

    const linked = await http.get('/api/locum/profile/linked-cpsns').expect(200);
    expect(linked.body).toEqual({ cpsnsNumber: '87654321', verified: false });

    await http
      .post('/api/locum/profile', { firstName: 'Dual', lastName: 'Role', cpsnsNumber: '87654321' })
      .expect((res) => expect([200, 201]).toContain(res.status));
    const profile = await db.locumProfile.findUniqueOrThrow({ where: { userId: locumUser.id } });
    expect(profile.cpsnsVerificationStatus).not.toBe(VerificationStatus.VERIFIED);
  });
});
