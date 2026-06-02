import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { HealthService } from './health.service.js';
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  @Get()
  check(): Promise<Record<string, unknown>> {
    return this.healthService.check();
  }
}
