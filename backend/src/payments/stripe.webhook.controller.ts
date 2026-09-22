import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { PaymentsService } from './payments.service.js';
import { StripeService } from './stripe.service.js';

@Controller('payments/stripe')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      return { received: false, error: 'Missing raw body' };
    }
    const event = this.stripeService.constructWebhookEvent(rawBody, signature);
    await this.paymentsService.handleStripeWebhookEvent(event);
    return { received: true };
  }
}
