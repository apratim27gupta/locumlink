import type { INestApplication } from '@nestjs/common';
import { ApplicationStatus, PostingStatus } from '@prisma/client';
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
import {
  checkoutSessionFor,
  createOpenAttempt,
  invoiceTotal,
  payInvoiceViaWebhook,
  postWebhook,
  signedEvent,
  stripeRefundFor,
} from '../helpers/stripe';
import Stripe from 'stripe';
import { StripeService } from '../../src/payments/stripe.service';
import { PaymentsService } from '../../src/payments/payments.service';

describe('Journey - Stripe match fee payments', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let stripe: StripeService;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    stripe = app.get(StripeService);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupTables();
  });

  async function createPendingInvoice() {
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
    });
    return { host, hostHttp, locum, application, invoice };
  }

  const admin = { id: 'admin_test', email: 'admin@locumlink.test' };

  function mockStripeRefunds(overrides: Partial<Stripe.Refund> = {}) {
    return jest
      .spyOn(stripe, 'refundMatchFeePayment')
      .mockImplementation(async (p) =>
        stripeRefundFor(p.refundId, { amount: p.amountCents, ...overrides }),
      );
  }

  /** Paid invoice whose locum withdrew more than 14 days out, so the policy grants a refund. */
  async function createRefundDueInvoice() {
    const created = await createPendingInvoice();
    await payInvoiceViaWebhook(ctx.agent, created.invoice);
    await authedAgent(ctx.agent, created.locum.token)
      .patch(`/api/locum/applications/${created.application.id}/withdraw`)
      .expect(200);
    return created;
  }

  const db = () => getTestDb();

  it('creates one checkout attempt, reuses it on a second click, and replaces it once nearly expired', async () => {
    const { hostHttp, invoice } = await createPendingInvoice();
    let created = 0;
    const createSpy = jest
      .spyOn(stripe, 'createMatchFeeCheckoutSession')
      .mockImplementation(async (p) => {
        created += 1;
        return {
          url: `https://checkout.stripe.com/c/pay/cs_test_${created}`,
          sessionId: `cs_test_${created}_${invoice.id}`,
          expiresAt: p.expiresAt,
        };
      });
    const expireSpy = jest
      .spyOn(stripe, 'expireCheckoutSession')
      .mockImplementation(async (id) => ({ id, status: 'expired' }) as never);

    const first = await hostHttp.post(`/api/host/match-fees/${invoice.id}/pay-stripe`).expect(200);
    const second = await hostHttp.post(`/api/host/match-fees/${invoice.id}/pay-stripe`).expect(200);
    expect(second.body.url).toBe(first.body.url);
    expect(createSpy).toHaveBeenCalledTimes(1);
    const [params] = createSpy.mock.calls[0];
    expect(invoice.taxRateBps).toBe(1400);
    expect(invoice.taxCents).toBe(Math.round(invoice.amountCents * 0.14));
    expect(params.feeCents).toBe(invoice.amountCents);
    expect(params.taxCents).toBe(invoice.taxCents);
    expect(params.taxLabel).toBe('HST (14%)');
    expect(params.currency).toBe('CAD');
    const firstAttempt = await db().matchFeePaymentAttempt.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(firstAttempt.amountCents).toBe(invoiceTotal(invoice));
    const expiryMinutes = (params.expiresAt.getTime() - Date.now()) / 60_000;
    expect(expiryMinutes).toBeGreaterThan(55);
    expect(expiryMinutes).toBeLessThanOrEqual(60);

    await db().matchFeePaymentAttempt.updateMany({
      where: { invoiceId: invoice.id },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    const third = await hostHttp.post(`/api/host/match-fees/${invoice.id}/pay-stripe`).expect(200);
    expect(third.body.url).not.toBe(first.body.url);
    expect(expireSpy).toHaveBeenCalledTimes(1);

    const attempts = await db().matchFeePaymentAttempt.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(attempts.map((a) => a.status)).toEqual(['SUPERSEDED', 'OPEN']);
    const stored = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.stripeCheckoutSessionId).toBe(attempts[1].stripeCheckoutSessionId);
  });

  it('records a failed attempt when Stripe rejects checkout creation', async () => {
    const { hostHttp, invoice } = await createPendingInvoice();
    jest
      .spyOn(stripe, 'createMatchFeeCheckoutSession')
      .mockRejectedValue(new Error('Stripe is down'));

    await hostHttp.post(`/api/host/match-fees/${invoice.id}/pay-stripe`).expect(400);
    const attempt = await db().matchFeePaymentAttempt.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(attempt.status).toBe('FAILED');
    expect(attempt.failureReason).toContain('Stripe is down');
  });

  it('marks the invoice paid once, even when Stripe redelivers the same event', async () => {
    const { invoice } = await createPendingInvoice();
    const { res, attempt, signed } = await payInvoiceViaWebhook(ctx.agent, invoice);
    expect(res.status).toBe(200);

    await postWebhook(ctx.agent, signed).expect(200);

    const paid = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid.status).toBe('PAID');
    const paidEvents = await db().matchFeeInvoiceEvent.count({
      where: { invoiceId: invoice.id, eventType: 'PAID' },
    });
    expect(paidEvents).toBe(1);
    const storedAttempt = await db().matchFeePaymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(storedAttempt.status).toBe('PAID');
    const log = await db().stripeWebhookEvent.findUniqueOrThrow({
      where: { id: signed.event.id },
    });
    expect(log.status).toBe('PROCESSED');
  });

  it('does not mark paid when the amount, currency or customer does not match', async () => {
    const { host, invoice } = await createPendingInvoice();
    const cases = [
      { amount_total: invoice.amountCents - 100 },
      { currency: 'usd' },
      { customer: 'cus_someone_else' },
    ];
    await db().hostProfile.update({
      where: { id: host.hostProfileId },
      data: { stripeCustomerId: 'cus_the_host' },
    });

    for (const overrides of cases) {
      const attempt = await createOpenAttempt(invoice);
      const session = checkoutSessionFor(attempt, {
        customer: 'cus_the_host',
        ...overrides,
      });
      await postWebhook(ctx.agent, signedEvent('checkout.session.completed', session)).expect(200);
      const stored = await db().matchFeePaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
      expect(stored.status).toBe('REJECTED');
      expect(stored.failureReason).toMatch(/Verification failed/);
    }

    const still = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(still.status).toBe('PENDING');
  });

  it('waits for async payments and records expired sessions', async () => {
    const { invoice } = await createPendingInvoice();
    const pending = await createOpenAttempt(invoice);
    await postWebhook(
      ctx.agent,
      signedEvent('checkout.session.completed', checkoutSessionFor(pending, { payment_status: 'unpaid' })),
    ).expect(200);
    expect(
      (await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    ).toBe('PENDING');
    expect(
      (await db().matchFeePaymentAttempt.findUniqueOrThrow({ where: { id: pending.id } })).status,
    ).toBe('OPEN');

    await postWebhook(
      ctx.agent,
      signedEvent('checkout.session.async_payment_succeeded', checkoutSessionFor(pending)),
    ).expect(200);
    expect(
      (await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    ).toBe('PAID');

    const { invoice: other } = await createPendingInvoice();
    const expiring = await createOpenAttempt(other);
    await postWebhook(
      ctx.agent,
      signedEvent(
        'checkout.session.expired',
        checkoutSessionFor(expiring, { status: 'expired', payment_status: 'unpaid' }),
      ),
    ).expect(200);
    expect(
      (await db().matchFeePaymentAttempt.findUniqueOrThrow({ where: { id: expiring.id } })).status,
    ).toBe('EXPIRED');
  });

  it('rejects bad signatures and ignores events from the other Stripe mode', async () => {
    const { invoice } = await createPendingInvoice();
    const attempt = await createOpenAttempt(invoice);
    const signed = signedEvent('checkout.session.completed', checkoutSessionFor(attempt));

    await postWebhook(ctx.agent, { payload: signed.payload, header: 't=1,v1=deadbeef' }).expect(400);
    const tampered = signed.payload.replace(`"amount_total":${invoiceTotal(invoice)}`, '"amount_total":1');
    expect(tampered).not.toBe(signed.payload);
    await postWebhook(ctx.agent, { payload: tampered, header: signed.header }).expect(400);

    const live = signedEvent('checkout.session.completed', checkoutSessionFor(attempt), {
      livemode: true,
    });
    await postWebhook(ctx.agent, live).expect(200);
    const log = await db().stripeWebhookEvent.findUniqueOrThrow({ where: { id: live.event.id } });
    expect(log.status).toBe('IGNORED');
    expect(
      (await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    ).toBe('PENDING');
  });

  it('holds a second payment for an admin to refund instead of refunding it automatically', async () => {
    const payments = app.get(PaymentsService);
    const { invoice } = await createPendingInvoice();
    await payInvoiceViaWebhook(ctx.agent, invoice);
    const refundSpy = mockStripeRefunds();

    const extra = await createOpenAttempt(invoice);
    const session = checkoutSessionFor(extra);
    const signed = signedEvent('checkout.session.completed', session);
    await postWebhook(ctx.agent, signed).expect(200);
    await postWebhook(ctx.agent, signedEvent('checkout.session.completed', session)).expect(200);

    expect(refundSpy).not.toHaveBeenCalled();
    let stored = await db().matchFeePaymentAttempt.findUniqueOrThrow({ where: { id: extra.id } });
    expect(stored.status).toBe('DUPLICATE');

    await expect(payments.refundDuplicatePayment(extra.id, admin, '')).rejects.toThrow(/note/);
    await payments.refundDuplicatePayment(extra.id, admin, 'Host paid twice');
    await expect(
      payments.refundDuplicatePayment(extra.id, admin, 'Host paid twice'),
    ).rejects.toThrow(/not an extra payment/);

    expect(refundSpy).toHaveBeenCalledTimes(1);
    const [call] = refundSpy.mock.calls[0];
    expect(call).toEqual(
      expect.objectContaining({
        paymentIntentId: session.payment_intent,
        amountCents: invoiceTotal(invoice),
      }),
    );
    stored = await db().matchFeePaymentAttempt.findUniqueOrThrow({ where: { id: extra.id } });
    expect(stored.status).toBe('DUPLICATE_REFUNDED');
    const refund = await db().matchFeeRefund.findUniqueOrThrow({ where: { id: call.refundId } });
    expect(refund).toEqual(
      expect.objectContaining({
        kind: 'DUPLICATE_PAYMENT',
        status: 'SUCCEEDED',
        requestedByAdminEmail: admin.email,
      }),
    );
    const settled = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(settled.status).toBe('PAID');
    expect(settled.refundedCents).toBe(0);
  });

  it('puts an eligible cancellation into admin review, then refunds fee and HST once approved', async () => {
    const payments = app.get(PaymentsService);
    const refundSpy = mockStripeRefunds();
    const { hostHttp, invoice } = await createRefundDueInvoice();

    expect(refundSpy).not.toHaveBeenCalled();
    const due = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(due.status).toBe('PAID');
    expect(due.refundResolution).toBe('PENDING');
    const hostView = await hostHttp.get(`/api/host/match-fees/${invoice.id}`).expect(200);
    expect(hostView.body.refundPendingReview).toBe(true);
    expect(hostView.body.totalCents).toBe(invoiceTotal(invoice));

    await expect(payments.resolveRefund(invoice.id, admin, ' ')).rejects.toThrow(/note/);
    await payments.resolveRefund(invoice.id, admin, 'Locum withdrew early');

    expect(refundSpy).toHaveBeenCalledTimes(1);
    const [call] = refundSpy.mock.calls[0];
    expect(call.amountCents).toBe(invoiceTotal(invoice));
    const refunded = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(refunded.status).toBe('REFUNDED');
    expect(refunded.refundedCents).toBe(invoiceTotal(invoice));
    const refund = await db().matchFeeRefund.findUniqueOrThrow({ where: { id: call.refundId } });
    expect(refund).toEqual(
      expect.objectContaining({
        kind: 'CANCELLATION',
        status: 'SUCCEEDED',
        amountCents: invoiceTotal(invoice),
        taxCents: invoice.taxCents,
        requestedByAdminId: admin.id,
      }),
    );

    await payments.resolveRefund(invoice.id, admin, 'Clicked again').catch(() => undefined);
    expect(refundSpy).toHaveBeenCalledTimes(1);
  });

  it('never refunds more than was paid when two admins approve at the same time', async () => {
    const payments = app.get(PaymentsService);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const refundSpy = jest
      .spyOn(stripe, 'refundMatchFeePayment')
      .mockImplementation(async (p) => {
        await gate;
        return stripeRefundFor(p.refundId, { amount: p.amountCents });
      });
    const { invoice } = await createRefundDueInvoice();

    const first = payments.resolveRefund(invoice.id, admin, 'Admin one');
    await new Promise((r) => setTimeout(r, 300));
    await expect(payments.resolveRefund(invoice.id, admin, 'Admin two')).rejects.toThrow(
      /already being processed/,
    );
    release();
    await first;

    expect(refundSpy).toHaveBeenCalledTimes(1);
    const stored = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.refundedCents).toBe(invoiceTotal(invoice));
  });

  it('gives the amount back to the invoice when Stripe later reports the refund failed', async () => {
    const payments = app.get(PaymentsService);
    const refundSpy = mockStripeRefunds({ status: 'pending' });
    const { invoice } = await createRefundDueInvoice();
    await payments.resolveRefund(invoice.id, admin, 'Locum withdrew early');

    const [call] = refundSpy.mock.calls[0];
    let refund = await db().matchFeeRefund.findUniqueOrThrow({ where: { id: call.refundId } });
    expect(refund.status).toBe('PENDING');

    const failed = stripeRefundFor(refund.id, {
      id: refund.stripeRefundId!,
      status: 'failed',
      failure_reason: 'expired_or_canceled_card',
    });
    const signed = signedEvent('refund.failed', failed);
    await postWebhook(ctx.agent, signed).expect(200);
    await postWebhook(ctx.agent, signedEvent('refund.updated', failed)).expect(200);

    refund = await db().matchFeeRefund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(refund.status).toBe('FAILED');
    expect(refund.failureReason).toContain('expired_or_canceled_card');
    const stored = await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe('PAID');
    expect(stored.refundedCents).toBe(0);
    expect(stored.refundResolution).toBe('PENDING');
    const failedEvents = await db().matchFeeInvoiceEvent.count({
      where: { invoiceId: invoice.id, eventType: 'REFUND_FAILED' },
    });
    expect(failedEvents).toBe(1);
  });

  it('keeps a refund Stripe did not answer for and finishes it from reconciliation', async () => {
    const payments = app.get(PaymentsService);
    jest
      .spyOn(stripe, 'refundMatchFeePayment')
      .mockRejectedValueOnce(
        new Stripe.errors.StripeConnectionError({ message: 'socket hang up' } as never),
      );
    const { invoice } = await createRefundDueInvoice();

    await expect(
      payments.resolveRefund(invoice.id, admin, 'Locum withdrew early'),
    ).rejects.toThrow(/retried automatically/);
    const pending = await db().matchFeeRefund.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(pending.status).toBe('REQUESTED');
    expect(
      (await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).refundedCents,
    ).toBe(invoiceTotal(invoice));

    jest.spyOn(stripe, 'findRefundForRow').mockResolvedValue(
      stripeRefundFor(pending.id, { amount: pending.amountCents }),
    );
    const result = await payments.reconcileRefunds(new Date(Date.now() + 10 * 60_000));
    expect(result).toEqual(expect.objectContaining({ checked: 1, succeeded: 1 }));
    const done = await db().matchFeeRefund.findUniqueOrThrow({ where: { id: pending.id } });
    expect(done.status).toBe('SUCCEEDED');
    expect(
      (await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    ).toBe('REFUNDED');
  });

  it('reconciles a payment whose webhook never arrived, and the host return sync confirms it too', async () => {
    const payments = app.get(PaymentsService);
    const { invoice } = await createPendingInvoice();
    const attempt = await createOpenAttempt(invoice);
    const session = checkoutSessionFor(attempt);
    jest.spyOn(stripe, 'retrieveCheckoutSession').mockResolvedValue(session);

    const tooSoon = await payments.reconcileOpenCheckoutSessions(new Date());
    expect(tooSoon.checked).toBe(0);

    const result = await payments.reconcileOpenCheckoutSessions(
      new Date(Date.now() + 5 * 60_000),
    );
    expect(result).toEqual(expect.objectContaining({ checked: 1, paid: 1 }));
    expect(
      (await db().matchFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    ).toBe('PAID');

    const { hostHttp, invoice: second } = await createPendingInvoice();
    const secondAttempt = await createOpenAttempt(second);
    jest
      .spyOn(stripe, 'retrieveCheckoutSession')
      .mockResolvedValue(checkoutSessionFor(secondAttempt));
    const synced = await hostHttp
      .post(`/api/host/match-fees/${second.id}/sync-payment`)
      .expect(200);
    expect(synced.body.status).toBe('PAID');
  });
});
