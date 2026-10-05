import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';

/** Stripe allows Checkout sessions to expire between 30 minutes and 24 hours after creation. */
const CHECKOUT_EXPIRY_MIN_MINUTES = 30;
const CHECKOUT_EXPIRY_MAX_MINUTES = 24 * 60;
const CHECKOUT_EXPIRY_DEFAULT_MINUTES = 60;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly frontendBaseUrl: string;
  private readonly liveMode: boolean;
  private readonly checkoutExpiryMinutes: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    this.frontendBaseUrl = (
      this.config.get<string>('HOST_FRONTEND_URL') ??
      this.config.get<string>('ALLOWED_ORIGINS')?.split(',')[0]?.trim() ??
      'http://localhost:3001'
    ).replace(/\/$/, '');
    this.liveMode = Boolean(
      secretKey?.startsWith('sk_live_') || secretKey?.startsWith('rk_live_'),
    );

    const configuredExpiry = Number(
      this.config.get<string>('STRIPE_CHECKOUT_EXPIRY_MINUTES'),
    );
    this.checkoutExpiryMinutes = Number.isFinite(configuredExpiry) && configuredExpiry > 0
      ? Math.min(
          CHECKOUT_EXPIRY_MAX_MINUTES,
          Math.max(CHECKOUT_EXPIRY_MIN_MINUTES, Math.round(configuredExpiry)),
        )
      : CHECKOUT_EXPIRY_DEFAULT_MINUTES;

    if (secretKey) {
      // Pin the API version so account default changes cannot silently alter Checkout/refund shapes.
      this.stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
      if (!this.webhookSecret) {
        this.logger.error(
          'STRIPE_WEBHOOK_SECRET is not set: payments will only be confirmed by reconciliation.',
        );
      }
    } else {
      this.stripe = null;
      this.logger.error(
        'STRIPE_SECRET_KEY is not set: hosts cannot pay match fees until Stripe is configured.',
      );
    }
  }

  isEnabled(): boolean {
    return this.stripe != null;
  }

  /** Whether the configured key is a live key; webhook events must come from the same mode. */
  isLiveMode(): boolean {
    return this.liveMode;
  }

  getCheckoutExpiryMinutes(): number {
    return this.checkoutExpiryMinutes;
  }

  getPublicConfig(): { enabled: boolean } {
    return { enabled: this.isEnabled() };
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Online payments are not available right now.');
    }
    return this.stripe;
  }

  /** Verifies the Stripe-Signature header (HMAC-SHA256 with the webhook secret, 5 minute tolerance). */
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): Stripe.Event {
    if (!this.stripe || !this.webhookSecret) {
      throw new Error('Stripe webhook is not configured.');
    }
    if (!signature) {
      throw new Error('Missing Stripe-Signature header.');
    }
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }

  async ensureHostStripeCustomer(hostProfileId: string): Promise<string> {
    const stripe = this.requireStripe();

    const host = await this.prisma.hostProfile.findUnique({
      where: { id: hostProfileId },
      select: {
        id: true,
        stripeCustomerId: true,
        practiceName: true,
        user: { select: { email: true } },
      },
    });
    if (!host?.user?.email) {
      throw new Error('Host email is required for Stripe checkout.');
    }
    if (host.stripeCustomerId) {
      const existing = await stripe.customers
        .retrieve(host.stripeCustomerId)
        .catch((err: unknown) => {
          if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
            return null;
          }
          throw err;
        });
      if (existing && !('deleted' in existing && existing.deleted)) {
        return host.stripeCustomerId;
      }
      this.logger.warn(
        `Stripe customer ${host.stripeCustomerId} for host ${hostProfileId} not found in this Stripe mode; creating a new one.`,
      );
    }

    const customer = await stripe.customers.create(
      {
        email: host.user.email,
        name: host.practiceName,
        metadata: { hostProfileId },
      },
      { idempotencyKey: `host-customer-${hostProfileId}-${this.liveMode ? 'live' : 'test'}` },
    );
    await this.prisma.hostProfile.update({
      where: { id: hostProfileId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  /** Safe to call again for the same refund row: Stripe returns the refund it already created. */
  async refundMatchFeePayment(params: {
    refundId: string;
    paymentIntentId: string;
    amountCents: number;
    invoiceId: string;
  }): Promise<Stripe.Refund> {
    const stripe = this.requireStripe();
    return stripe.refunds.create(
      {
        payment_intent: params.paymentIntentId,
        amount: params.amountCents,
        reason: 'requested_by_customer',
        metadata: {
          matchFeeInvoiceId: params.invoiceId,
          matchFeeRefundId: params.refundId,
        },
      },
      { idempotencyKey: `match-fee-refund-${params.refundId}` },
    );
  }

  async retrieveRefund(refundId: string): Promise<Stripe.Refund> {
    return this.requireStripe().refunds.retrieve(refundId);
  }

  /** Looks up a refund we created for `refundRowId` in case the create response was lost. */
  async findRefundForRow(
    paymentIntentId: string,
    refundRowId: string,
  ): Promise<Stripe.Refund | null> {
    const refunds = await this.requireStripe().refunds.list({
      payment_intent: paymentIntentId,
      limit: 100,
    });
    return refunds.data.find((r) => r.metadata?.matchFeeRefundId === refundRowId) ?? null;
  }

  async createMatchFeeCheckoutSession(params: {
    attemptId: string;
    invoiceId: string;
    hostProfileId: string;
    feeCents: number;
    taxCents: number;
    taxLabel: string;
    currency: string;
    jobTitle: string;
    expiresAt: Date;
  }): Promise<{ url: string; sessionId: string; expiresAt: Date }> {
    const stripe = this.requireStripe();

    const customerId = await this.ensureHostStripeCustomer(params.hostProfileId);
    const successUrl = `${this.frontendBaseUrl}/host/invoices?paid=1&invoiceId=${encodeURIComponent(params.invoiceId)}`;
    const cancelUrl = `${this.frontendBaseUrl}/host/invoices?cancelled=1&invoiceId=${encodeURIComponent(params.invoiceId)}`;
    const metadata = {
      matchFeeInvoiceId: params.invoiceId,
      paymentAttemptId: params.attemptId,
      hostProfileId: params.hostProfileId,
    };

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer: customerId,
        client_reference_id: params.invoiceId,
        expires_at: Math.floor(params.expiresAt.getTime() / 1000),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: params.currency.toLowerCase(),
              unit_amount: params.feeCents,
              product_data: {
                name: 'LocumLink match fee',
                description: `Successful match: ${params.jobTitle}`,
              },
            },
          },
          ...(params.taxCents > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency: params.currency.toLowerCase(),
                    unit_amount: params.taxCents,
                    product_data: { name: params.taxLabel },
                  },
                },
              ]
            : []),
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        payment_intent_data: { metadata },
      },
      { idempotencyKey: `match-fee-checkout-${params.attemptId}` },
    );

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL.');
    }

    return {
      url: session.url,
      sessionId: session.id,
      expiresAt: new Date(session.expires_at * 1000),
    };
  }

  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.requireStripe().checkout.sessions.retrieve(sessionId);
  }

  /** Expires an open session so it can no longer be paid. Returns the latest session state. */
  async expireCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = this.requireStripe();
    try {
      return await stripe.checkout.sessions.expire(sessionId);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError) {
        return stripe.checkout.sessions.retrieve(sessionId);
      }
      throw err;
    }
  }
}
