import { Module } from '@nestjs/common';
import { FeedbackModule } from '../feedback/feedback.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { SupportTicketsModule } from '../support-tickets/support-tickets.module.js';
import { GcsModule } from '../gcs/gcs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [
    PrismaModule,
    GcsModule,
    NotificationsModule,
    FeedbackModule,
    PaymentsModule,
    SupportTicketsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
