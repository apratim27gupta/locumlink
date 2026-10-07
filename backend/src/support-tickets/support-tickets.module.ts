import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SupportTicketsService } from './support-tickets.service.js';
import { SupportTicketsController } from './support-tickets.controller.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
  exports: [SupportTicketsService],
})
export class SupportTicketsModule {}
