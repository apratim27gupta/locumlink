import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '../auth/decorators/public.decorator.js';
import { PaymentsService } from './payments.service.js';
import { StripeService } from './stripe.service.js';

@Controller('payments/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Any non-2xx response makes Stripe retry the delivery (up to 3 days in live mode), so
   * processing errors are allowed to surface as 5xx. Bad signatures get 400.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }
    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Rejected Stripe webhook: ${message}`);
      throw new BadRequestException('Invalid Stripe signature');
    }
    await this.paymentsService.handleStripeWebhookEvent(event);
    return { received: true };
  }
}
