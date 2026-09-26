import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { SupportTicketsService } from './support-tickets.service.js';

interface JwtRequest {
  user: { id: string; email: string; role: string };
}

@Controller('host/support-tickets')
@UseGuards(AuthGuard('jwt'))
@Roles(Role.HOST)
export class SupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Get()
  list(@Req() req: JwtRequest) {
    return this.tickets.listForHost(req.user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: JwtRequest,
    @Body()
    body: {
      jobPostingId?: string;
      message?: string;
      matchFeeInvoiceId?: string;
    },
  ) {
    return this.tickets.createHostTicket(req.user.id, {
      jobPostingId: typeof body.jobPostingId === 'string' ? body.jobPostingId : '',
      message: typeof body.message === 'string' ? body.message : '',
      matchFeeInvoiceId:
        typeof body.matchFeeInvoiceId === 'string' ? body.matchFeeInvoiceId : '',
    });
  }
}
