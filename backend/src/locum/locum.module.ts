import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PlacementFeedbackModule } from '../placement-feedback/placement-feedback.module.js';
import { LocumController } from './locum.controller.js';
import { LocumService } from './locum.service.js';
@Module({
  imports: [AuthModule, NotificationsModule, PlacementFeedbackModule],
  controllers: [LocumController],
  providers: [LocumService],
})
export class LocumModule {}
