import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly frontendBaseUrl: string;

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

    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      this.stripe = null;
    }
  }

  isEnabled(): boolean {
    return this.stripe != null;
  }

  getPublicConfig(): { enabled: boolean; mockEnabled: boolean } {
    return {
      enabled: this.isEnabled(),
      mockEnabled: true,
    };
  }

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
    if (!this.stripe) throw new Error('Stripe is not configured.');

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
    if (host.stripeCustomerId) return host.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: host.user.email,
      name: host.practiceName,
      metadata: { hostProfileId },
    });
    await this.prisma.hostProfile.update({
      where: { id: hostProfileId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  async refundMatchFeePayment(params: {
    paymentIntentId: string;
    amountCents: number;
    invoiceId: string;
  }): Promise<string> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured.');
    }
    const refund = await this.stripe.refunds.create({
      payment_intent: params.paymentIntentId,
      amount: params.amountCents,
      metadata: { matchFeeInvoiceId: params.invoiceId },
    });
    return refund.id;
  }

  async createMatchFeeCheckoutSession(params: {
    invoiceId: string;
    hostProfileId: string;
    amountCents: number;
    currency: string;
    jobTitle: string;
  }): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) throw new Error('Stripe is not configured.');

    const customerId = await this.ensureHostStripeCustomer(params.hostProfileId);
    const successUrl = `${this.frontendBaseUrl}/host/invoices?paid=1&invoiceId=${encodeURIComponent(params.invoiceId)}`;
    const cancelUrl = `${this.frontendBaseUrl}/host/invoices?cancelled=1&invoiceId=${encodeURIComponent(params.invoiceId)}`;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency.toLowerCase(),
            unit_amount: params.amountCents,
            product_data: {
              name: 'LocumLink match fee',
              description: `Successful match: ${params.jobTitle}`,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        matchFeeInvoiceId: params.invoiceId,
        hostProfileId: params.hostProfileId,
      },
      payment_intent_data: {
        metadata: {
          matchFeeInvoiceId: params.invoiceId,
        },
      },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL.');
    }

    return { url: session.url, sessionId: session.id };
  }
}
