import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
})
export class AdminModule {}

