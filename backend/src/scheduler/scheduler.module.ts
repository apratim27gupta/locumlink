import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PlacementFeedbackModule } from '../placement-feedback/placement-feedback.module.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    NotificationsModule,
    PlacementFeedbackModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
