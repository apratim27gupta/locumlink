import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PaymentsService } from './payments.service.js';

interface JwtRequest {
  user: { id: string; email: string; role: string };
}

@Controller('host/match-fees')
@UseGuards(AuthGuard('jwt'))
@Roles(Role.HOST)
export class HostPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('policy')
  getPolicy() {
    return this.payments.getPolicy('HOST');
  }

  @Get('due-count')
  getDueCount(@Req() req: JwtRequest) {
    return this.payments.getHostMatchFeeDueCount(req.user.id);
  }

  @Get()
  listInvoices(
    @Req() req: JwtRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.payments.listHostInvoices(req.user.id, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status,
      jobPostingId: query.jobPostingId,
    });
  }

  @Get(':id/receipt.pdf')
  async downloadReceipt(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.payments.buildHostReceiptPdf(req.user.id, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="locumlink-match-fee-${id.slice(-8)}.pdf"`,
    });
    res.send(pdf);
  }

  @Get(':id')
  getInvoice(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.payments.getHostInvoice(req.user.id, id);
  }

  @Post(':id/pay-mock')
  @HttpCode(HttpStatus.OK)
  payMock(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.payments.payMock(req.user.id, id);
  }

  @Post(':id/pay-stripe')
  @HttpCode(HttpStatus.OK)
  payStripe(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.payments.createStripeCheckoutForHost(req.user.id, id);
  }
}

@Controller('locum/match-fees')
@UseGuards(AuthGuard('jwt'))
@Roles(Role.LOCUM)
export class LocumPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('policy')
  getPolicy() {
    return this.payments.getPolicy('LOCUM');
  }
}
