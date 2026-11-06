import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { CreateDemoRequestDto } from './demo-requests.dto.js';
import { DemoRequestsService } from './demo-requests.service.js';

@Controller('demo-requests')
export class DemoRequestsController {
  constructor(private readonly demoRequests: DemoRequestsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  /** Per-IP: 5 POSTs / 15 min (LB Cloud Armor is a second layer). */
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  create(@Body() body: CreateDemoRequestDto) {
    return this.demoRequests.create(body);
  }
}
