import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsService } from './payments.service.js';
import { StripeService } from './stripe.service.js';
import {
  HostPaymentsController,
  LocumPaymentsController,
} from './payments.controller.js';
import { StripeWebhookController } from './stripe.webhook.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, NotificationsModule, ConfigModule],
  controllers: [
    HostPaymentsController,
    LocumPaymentsController,
    StripeWebhookController,
  ],
  providers: [PaymentsService, StripeService],
  exports: [PaymentsService, StripeService],
})
export class PaymentsModule {}
