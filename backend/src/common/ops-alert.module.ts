import { Global, Module } from '@nestjs/common';
import { OpsAlertService } from './ops-alert.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [OpsAlertService],
  exports: [OpsAlertService],
})
export class OpsAlertModule {}
