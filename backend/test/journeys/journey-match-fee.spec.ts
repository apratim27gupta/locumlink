import type { INestApplication } from '@nestjs/common';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from '../setup/test-app';
import { cleanupTables, getTestDb } from '../helpers/db';
import { authedAgent } from '../helpers/http';
import { createHostUser, createLocumUser } from '../factories/user.factory';
import { createJobPosting, futureCalendarDate } from '../factories/job.factory';
import { createApplication } from '../factories/application.factory';
import { ApplicationStatus, PostingStatus } from '@prisma/client';

describe('Journey — Match fee invoices', () => {
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

  async function confirmAndAccept(params: {
    hostToken: string;
    locumToken: string;
    jobId: string;
    applicationId: string;
  }) {
    const hostHttp = authedAgent(ctx.agent, params.hostToken);
    const locumHttp = authedAgent(ctx.agent, params.locumToken);

    await hostHttp
      .patch(`/api/host/jobs/${params.jobId}/applications/${params.applicationId}`, {
        status: 'SHORTLISTED',
      })
      .expect(200);

    await hostHttp
      .patch(`/api/host/jobs/${params.jobId}/applications/${params.applicationId}`, {
        status: 'CONFIRMED',
      })
      .expect(200);

    await locumHttp
      .patch(`/api/locum/applications/${params.applicationId}/respond`, {
        response: 'accept',
      })
      .expect(200);
  }

  it('creates a $250 invoice when locum accepts and allows mock payment', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const job = await createJobPosting(host.hostProfileId, {
      status: PostingStatus.ACTIVE,
      startDate: new Date(`${futureCalendarDate(30)}T00:00:00.000Z`),
      endDate: new Date(`${futureCalendarDate(31)}T00:00:00.000Z`),
    });
    const application = await createApplication({
      jobPostingId: job.id,
      locumProfileId: locum.locumProfileId,
      status: ApplicationStatus.APPLIED,
    });

    await confirmAndAccept({
      hostToken: host.token,
      locumToken: locum.token,
      jobId: job.id,
      applicationId: application.id,
    });

    const db = getTestDb();
    const invoice = await db.matchFeeInvoice.findUnique({
      where: { applicationId: application.id },
    });
    expect(invoice).toEqual(
      expect.objectContaining({
        amountCents: 25000,
        currency: 'CAD',
        status: 'PENDING',
        hostProfileId: host.hostProfileId,
      }),
    );

    const hostHttp = authedAgent(ctx.agent, host.token);
    const list = await hostHttp.get('/api/host/match-fees').expect(200);
    expect(list.body.items).toHaveLength(1);

    const pay = await hostHttp
      .post(`/api/host/match-fees/${invoice!.id}/pay-mock`)
      .expect(200);
    expect(pay.body.invoice.status).toBe('PAID');
    expect(pay.body.invoice.mockPaymentRef).toMatch(/^mock_/);

    const paid = await db.matchFeeInvoice.findUnique({
      where: { id: invoice!.id },
    });
    expect(paid?.status).toBe('PAID');
    expect(paid?.paidAt).not.toBeNull();
  });

  it('cancels an unpaid invoice when locum withdraws more than 14 days before start', async () => {
    const host = await createHostUser();
    const locum = await createLocumUser();
    const job = await createJobPosting(host.hostProfileId, {
      status: PostingStatus.ACTIVE,
      startDate: new Date(`${futureCalendarDate(30)}T00:00:00.000Z`),
      endDate: new Date(`${futureCalendarDate(31)}T00:00:00.000Z`),
    });
    const application = await createApplication({
      jobPostingId: job.id,
      locumProfileId: locum.locumProfileId,
      status: ApplicationStatus.APPLIED,
    });

    await confirmAndAccept({
      hostToken: host.token,
      locumToken: locum.token,
      jobId: job.id,
      applicationId: application.id,
    });

    const locumHttp = authedAgent(ctx.agent, locum.token);
    await locumHttp
      .patch(`/api/locum/applications/${application.id}/withdraw`)
      .expect(200);

    const invoice = await getTestDb().matchFeeInvoice.findUnique({
      where: { applicationId: application.id },
    });
    expect(invoice?.status).toBe('CANCELLED');
  });
});
