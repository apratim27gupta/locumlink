import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HostController } from './host.controller.js';
import { HostService } from './host.service.js';

@Module({
  imports: [AuthModule],
  controllers: [HostController],
  providers: [HostService],
})
export class HostModule {}
