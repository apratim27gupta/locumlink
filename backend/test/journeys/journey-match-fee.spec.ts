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

  it('creates a tiered invoice when locum accepts and allows mock payment', async () => {
    const host = await createHostUser();
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
    // Multi-day legacy span at 7h/day → >3.5h → $250.
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

  it('invoices $125 for a single half-day SLOTS claim and $250 for a second locum on the same posting', async () => {
    const host = await createHostUser();
    const locumA = await createLocumUser();
    const locumB = await createLocumUser();
    const day = futureCalendarDate(40);
    const db = getTestDb();
    const job = await db.jobPosting.create({
      data: {
        hostProfileId: host.hostProfileId,
        title: 'Slots fee test',
        description: 'test',
        servicesRequired: [],
        status: PostingStatus.ACTIVE,
        location: 'Halifax',
        scheduleModel: 'SLOTS',
        scheduleType: 'DATES',
        startDate: new Date(`${day}T00:00:00.000Z`),
        endDate: new Date(`${day}T00:00:00.000Z`),
        startTime: '08:00',
        endTime: '15:00',
        publishedAt: new Date(),
        shifts: {
          create: [
            {
              date: new Date(`${day}T00:00:00.000Z`),
              shiftType: 'HALF_DAY',
              startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0, 0)),
              endTime: new Date(Date.UTC(1970, 0, 1, 11, 30, 0, 0)),
            },
            {
              date: new Date(`${day}T00:00:00.000Z`),
              shiftType: 'HALF_DAY',
              startTime: new Date(Date.UTC(1970, 0, 1, 12, 0, 0, 0)),
              endTime: new Date(Date.UTC(1970, 0, 1, 15, 30, 0, 0)),
            },
          ],
        },
      },
      include: { shifts: true },
    });
    const [shiftAm, shiftPm] = [...job.shifts].sort(
      (a, b) =>
        (a.startTime?.getUTCHours() ?? 0) - (b.startTime?.getUTCHours() ?? 0),
    );

    const appA = await createApplication({
      jobPostingId: job.id,
      locumProfileId: locumA.locumProfileId,
      status: ApplicationStatus.APPLIED,
    });
    await db.application.update({
      where: { id: appA.id },
      data: {
        availabilityKind: 'PARTIAL',
        availableDates: [day],
        requestedShiftIds: [shiftAm.id],
      },
    });

    await confirmAndAccept({
      hostToken: host.token,
      locumToken: locumA.token,
      jobId: job.id,
      applicationId: appA.id,
    });

    const invA = await db.matchFeeInvoice.findUnique({
      where: { applicationId: appA.id },
    });
    expect(invA?.amountCents).toBe(12500);
    expect(invA?.matchFeeTier).toBe('HALF');

    const appB = await createApplication({
      jobPostingId: job.id,
      locumProfileId: locumB.locumProfileId,
      status: ApplicationStatus.APPLIED,
    });
    await db.application.update({
      where: { id: appB.id },
      data: {
        availabilityKind: 'PARTIAL',
        availableDates: [day],
        requestedShiftIds: [shiftPm.id],
      },
    });

    await confirmAndAccept({
      hostToken: host.token,
      locumToken: locumB.token,
      jobId: job.id,
      applicationId: appB.id,
    });

    const invB = await db.matchFeeInvoice.findUnique({
      where: { applicationId: appB.id },
    });
    expect(invB?.amountCents).toBe(12500);
    expect(invB?.id).not.toBe(invA?.id);

    const all = await db.matchFeeInvoice.findMany({
      where: { jobPostingId: job.id },
    });
    expect(all).toHaveLength(2);
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
