import { Global, Module } from '@nestjs/common';
import { GcsService } from './gcs.service.js';
@Global()
@Module({
  providers: [GcsService],
  exports: [GcsService],
})
export class GcsModule {}
