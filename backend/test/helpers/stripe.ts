import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import type request from 'supertest';
import { getTestDb } from './db';

const signer = new Stripe('sk_test_journey_dummy');

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export type TestInvoice = {
  id: string;
  hostProfileId: string;
  amountCents: number;
  taxCents?: number;
  currency: string;
};

export function invoiceTotal(invoice: TestInvoice): number {
  return invoice.amountCents + (invoice.taxCents ?? 0);
}

/** Simulates a Checkout session the API created: an OPEN attempt row with a session id. */
export async function createOpenAttempt(invoice: TestInvoice, overrides?: { expiresAt?: Date }) {
  const sessionId = randomId('cs_test');
  const attempt = await getTestDb().matchFeePaymentAttempt.create({
    data: {
      invoiceId: invoice.id,
      hostProfileId: invoice.hostProfileId,
      amountCents: invoiceTotal(invoice),
      currency: invoice.currency,
      stripeCheckoutSessionId: sessionId,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
      expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60 * 60_000),
    },
  });
  return attempt;
}

export function checkoutSessionFor(
  attempt: { id: string; invoiceId: string; hostProfileId: string; amountCents: number; currency: string; stripeCheckoutSessionId: string | null },
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: attempt.stripeCheckoutSessionId!,
    object: 'checkout.session',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: attempt.amountCents,
    currency: attempt.currency.toLowerCase(),
    customer: null,
    payment_intent: randomId('pi_test'),
    client_reference_id: attempt.invoiceId,
    metadata: {
      matchFeeInvoiceId: attempt.invoiceId,
      paymentAttemptId: attempt.id,
      hostProfileId: attempt.hostProfileId,
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

export function stripeRefundFor(
  refundRowId: string,
  overrides: Partial<Stripe.Refund> = {},
): Stripe.Refund {
  return {
    id: randomId('re_test'),
    object: 'refund',
    status: 'succeeded',
    amount: 0,
    currency: 'cad',
    metadata: { matchFeeRefundId: refundRowId },
    ...overrides,
  } as Stripe.Refund;
}

export function signedEvent(
  type: string,
  object: unknown,
  overrides: { id?: string; livemode?: boolean } = {},
) {
  const event = {
    id: overrides.id ?? randomId('evt_test'),
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: overrides.livemode ?? false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_journey_test_secret',
  });
  return { event, payload, header };
}

export function postWebhook(
  agent: ReturnType<typeof request>,
  signed: { payload: string; header: string },
) {
  return agent
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signed.header)
    .send(signed.payload);
}

/** Pays an invoice the way production does: a signed checkout.session.completed webhook. */
export async function payInvoiceViaWebhook(
  agent: ReturnType<typeof request>,
  invoice: TestInvoice,
) {
  const attempt = await createOpenAttempt(invoice);
  const session = checkoutSessionFor(attempt);
  const signed = signedEvent('checkout.session.completed', session);
  const res = await postWebhook(agent, signed);
  return { res, attempt, session, signed };
}
