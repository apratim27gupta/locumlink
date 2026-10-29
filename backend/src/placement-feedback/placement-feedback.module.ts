import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PlacementFeedbackController } from './placement-feedback.controller.js';
import { PlacementFeedbackPublicController } from './placement-feedback-public.controller.js';
import { PlacementFeedbackService } from './placement-feedback.service.js';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule],
  controllers: [
    PlacementFeedbackController,
    PlacementFeedbackPublicController,
  ],
  providers: [PlacementFeedbackService],
  exports: [PlacementFeedbackService],
})
export class PlacementFeedbackModule {}
