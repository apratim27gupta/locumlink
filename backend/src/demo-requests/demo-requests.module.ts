import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DemoRequestsController } from './demo-requests.controller.js';
import { DemoRequestsService } from './demo-requests.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [DemoRequestsController],
  providers: [DemoRequestsService],
  exports: [DemoRequestsService],
})
export class DemoRequestsModule {}
