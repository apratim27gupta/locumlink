import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GcsModule } from '../gcs/gcs.module.js';
import { MessageController } from './message.controller.js';
import { MessageService } from './message.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
@Module({
  imports: [PrismaModule, GcsModule, NotificationsModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
