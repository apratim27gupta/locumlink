import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushService } from './push.service.js';
import { EmailService } from './email.service.js';
import { AdminNotificationsService } from './admin-notifications.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    AdminNotificationsService,
    PushService,
    EmailService,
  ],
  exports: [
    NotificationsService,
    AdminNotificationsService,
    PushService,
    EmailService,
  ],
})
export class NotificationsModule {}
