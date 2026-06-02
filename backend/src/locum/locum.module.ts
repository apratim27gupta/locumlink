import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { LocumController } from './locum.controller.js';
import { LocumService } from './locum.service.js';
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [LocumController],
  providers: [LocumService],
})
export class LocumModule {}
