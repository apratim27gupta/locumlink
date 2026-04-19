import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LocumController } from './locum.controller.js';
import { LocumService } from './locum.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LocumController],
  providers: [LocumService],
})
export class LocumModule {}
