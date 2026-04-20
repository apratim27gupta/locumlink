import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UploadController } from './upload.controller.js';

@Module({
  imports:     [AuthModule],
  controllers: [UploadController],
})
export class UploadModule {}