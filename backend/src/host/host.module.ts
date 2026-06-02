import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { GcsModule } from '../gcs/gcs.module.js';
import { HostController } from './host.controller.js';
import { HostPublicController } from './host-public.controller.js';
import { HostService } from './host.service.js';
@Module({
  imports: [AuthModule, GcsModule, NotificationsModule],
  controllers: [HostController, HostPublicController],
  providers: [HostService],
})
export class HostModule {}
