import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator.js';
import type { AdminJwtPayload } from '../admin-auth/admin-auth.types.js';
import { AdminNotificationsService } from '../notifications/admin-notifications.service.js';
import { FeedbackService } from '../feedback/feedback.service.js';
import { SupportTicketsService } from '../support-tickets/support-tickets.service.js';
import { AdminService } from './admin.service.js';
import { AdminReportActionDto } from './dto/admin-report-action.dto.js';
import { AdminRemindUserDto } from './dto/admin-remind-user.dto.js';
import { AdminBroadcastUsersDto } from './dto/admin-broadcast-users.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { AdminUpdateVerificationDto } from './dto/admin-update-verification.dto.js';
import { PaymentsService } from '../payments/payments.service.js';
import {
  AdminDiscretionaryRefundDto,
  AdminOverrideDto,
  AdminReplacementStatusDto,
  AdminResolveRefundDto,
  AdminSendReminderDto,
  AdminWriteOffDto,
} from '../payments/payments.dto.js';

@Public()
@UseGuards(AdminJwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly adminNotifications: AdminNotificationsService,
    private readonly feedback: FeedbackService,
    private readonly payments: PaymentsService,
    private readonly supportTickets: SupportTicketsService,
  ) {}

  @Get('stats')
  async stats(@CurrentAdmin() admin: AdminJwtPayload) {
    const stats = await this.admin.stats();
    return { admin, stats };
  }

  @Get('analytics/summary')
  async analyticsSummary(
    @Query('preset') preset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.admin.analyticsSummary({ preset, dateFrom, dateTo });
  }

  @Get('analytics/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportAnalytics(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Res() res: Response,
    @Query('preset') preset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const csv = await this.admin.exportAnalyticsCsv(req, admin, {
      preset,
      dateFrom,
      dateTo,
    });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="locumlink-analytics-${date}.csv"`,
    );
    return res.status(200).send(`\uFEFF${csv}`);
  }

  @Get('jobs')
  async listJobs(
    @Query('preset') preset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    return this.admin.listJobs({
      preset,
      dateFrom,
      dateTo,
      status,
      q,
      page: page ?? 1,
      pageSize: Math.min(Math.max(pageSize ?? 50, 1), 200),
    });
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const detail = await this.admin.getJob(id);
    if (!detail) {
      throw new NotFoundException('Job not found');
    }
    return detail;
  }

  @Get('applications')
  async listApplications(
    @Query('preset') preset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    return this.admin.listApplications({
      preset,
      dateFrom,
      dateTo,
      status,
      q,
      page: page ?? 1,
      pageSize: Math.min(Math.max(pageSize ?? 50, 1), 200),
    });
  }

  @Get('reports')
  async reports(@Query('status') status?: string) {
    return this.admin.listReports({ status });
  }

  @Get('feedback')
  async listFeedback() {
    return this.feedback.listForAdmin();
  }

  @Get('support-tickets')
  async listSupportTickets(@Query('status') status?: string) {
    return this.supportTickets.listForAdmin(status);
  }

  @Patch('support-tickets/:id')
  @HttpCode(HttpStatus.OK)
  async resolveSupportTicket(
    @Param('id') id: string,
    @Body() body: { status?: 'RESOLVED' | 'DISMISSED'; adminNotes?: string },
  ) {
    const status = body?.status;
    if (status !== 'RESOLVED' && status !== 'DISMISSED') {
      throw new BadRequestException('status must be RESOLVED or DISMISSED');
    }
    return this.supportTickets.resolveTicket(id, {
      status,
      adminNotes: body.adminNotes,
    });
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    return this.admin.getReport(id);
  }

  @Patch('reports/:id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async patchReport(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Param('id') id: string,
    @Body() dto: AdminReportActionDto,
  ) {
    return this.admin.actionReport(req, admin, id, dto);
  }

  @Get('users')
  async users(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('accountStatus') accountStatus?: string,
    @Query('credentialStatus') credentialStatus?: string,
  ) {
    return this.admin.listUsers({
      q,
      role,
      accountStatus,
      credentialStatus,
      page,
      pageSize: Math.min(Math.max(pageSize, 1), 1000),
    });
  }

  @Get('users/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="users.csv"')
  async exportUsers(@Query('q') q: string | undefined, @Res() res: Response) {
    const csv = await this.admin.exportUsersCsv(q);
    return res.status(200).send(`\uFEFF${csv}`);
  }

  @Get('users/:id/profile')
  async getUserProfile(@Param('id') id: string) {
    const detail = await this.admin.getUserProfileByUserId(id);
    if (!detail) {
      throw new NotFoundException('User not found');
    }
    return detail;
  }

  @Patch('users/:id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async patchUser(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.admin.updateUser(req, admin, id, dto);
  }

  @Post('users/broadcast')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async broadcastUsers(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Body() dto: AdminBroadcastUsersDto,
  ) {
    return this.admin.broadcastUsers(req, admin, dto);
  }

  @Post('users/:id/remind')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async remindUser(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Param('id') id: string,
    @Body() dto: AdminRemindUserDto,
  ) {
    return this.admin.remindUserProfile(req, admin, id, dto.channel);
  }

  @Get('verifications')
  async verifications(@Query('status') status?: string) {
    const filter = parseVerificationTab(status);
    return { items: await this.admin.listVerifications({ filter }) };
  }

  @Get('verifications/:profileId')
  async getVerification(
    @Param('profileId') profileId: string,
    @Query('profileType') profileType: string | undefined,
  ) {
    const hint =
      profileType === 'locum' || profileType === 'host'
        ? profileType
        : undefined;
    const resolved = await this.admin.resolveVerificationProfileType(
      profileId,
      hint,
    );
    if (!resolved) {
      throw new NotFoundException('Profile not found');
    }
    const detail = await this.admin.getVerificationDetail(profileId, resolved);
    if (!detail) {
      throw new NotFoundException('Profile not found');
    }
    return detail;
  }

  @Patch('verifications/:profileId')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async patchVerification(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Param('profileId') profileId: string,
    @Query('profileType') profileTypeQuery: string | undefined,
    @Body() dto: AdminUpdateVerificationDto,
  ) {
    const hint =
      profileTypeQuery === 'locum' || profileTypeQuery === 'host'
        ? profileTypeQuery
        : dto.profileType;
    const resolved = await this.admin.resolveVerificationProfileType(
      profileId,
      hint,
    );
    if (!resolved) {
      throw new NotFoundException('Profile not found');
    }
    if (resolved === 'host') {
      return this.admin.updateHostVerification(req, admin, profileId, dto);
    }
    return this.admin.updateLocumVerification(req, admin, profileId, dto);
  }

  @Get('audit-logs')
  async auditLogs(
    @Query('take', new DefaultValuePipe(200), ParseIntPipe) take: number,
    @Query('q') q?: string,
  ) {
    return {
      items: await this.admin.listAuditLogs({
        q,
        take: Math.min(Math.max(take, 1), 500),
      }),
    };
  }

  @Get('notifications')
  async notifications(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminNotifications.getNotifications(admin.sub);
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(
    @CurrentAdmin() admin: AdminJwtPayload,
    @Param('id') id: string,
  ) {
    await this.adminNotifications.markRead(admin.sub, id);
    return { ok: true };
  }

  @Get('match-fees/summary')
  async matchFeeSummary(@Query('days') days?: string) {
    const parsed =
      days != null && days !== '' && days !== 'all'
        ? Number(days)
        : undefined;
    return this.payments.adminMatchFeeSummary({
      days:
        parsed != null && Number.isFinite(parsed) && parsed > 0
          ? Math.min(Math.floor(parsed), 3650)
          : undefined,
    });
  }

  @Get('match-fees')
  async listMatchFees(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('escalatedOnly') escalatedOnly?: string,
  ) {
    return this.payments.listAdminInvoices({
      cursor,
      limit: limit ? Number(limit) : undefined,
      status,
      escalatedOnly: escalatedOnly === 'true',
    });
  }

  @Post('match-fees/:id/send-reminder')
  @HttpCode(HttpStatus.OK)
  async sendMatchFeeReminder(
    @Param('id') id: string,
    @Body() dto: AdminSendReminderDto,
  ) {
    return this.payments.sendAdminPaymentReminder(id, {
      sendEmail: dto.sendEmail,
      sendNotification: dto.sendNotification,
    });
  }

  @Post('match-fees/:id/resolve-refund')
  @HttpCode(HttpStatus.OK)
  async resolveMatchFeeRefund(
    @Param('id') id: string,
    @Body() dto: AdminResolveRefundDto,
  ) {
    return this.payments.resolveRefund(id, dto.adminNotes);
  }

  @Post('match-fees/:id/discretionary-refund')
  @HttpCode(HttpStatus.OK)
  async discretionaryMatchFeeRefund(
    @Param('id') id: string,
    @Body() dto: AdminDiscretionaryRefundDto,
  ) {
    return this.payments.discretionaryRefund(id, {
      amountCents: dto.amountCents,
      adminNotes: dto.adminNotes,
      ticketId: dto.ticketId,
    });
  }

  @Post('match-fees/:id/admin-note')
  @HttpCode(HttpStatus.OK)
  async addMatchFeeAdminNote(
    @Param('id') id: string,
    @Body() dto: AdminWriteOffDto,
  ) {
    if (!dto.adminNotes?.trim()) {
      throw new BadRequestException('Notes are required.');
    }
    return this.payments.addAdminNote(id, dto.adminNotes);
  }

  @Post('match-fees/:id/replacement-status')
  @HttpCode(HttpStatus.OK)
  async setMatchFeeReplacementStatus(
    @Param('id') id: string,
    @Body() dto: AdminReplacementStatusDto,
  ) {
    return this.payments.setReplacementStatus(
      id,
      dto.replacementStatus,
      dto.adminNotes,
    );
  }

  @Post('match-fees/:id/write-off')
  @HttpCode(HttpStatus.OK)
  async writeOffMatchFee(
    @Param('id') id: string,
    @Body() dto: AdminWriteOffDto,
  ) {
    return this.payments.writeOffInvoice(id, dto.adminNotes);
  }

  @Post('match-fees/:id/override')
  @HttpCode(HttpStatus.OK)
  async overrideMatchFee(
    @Param('id') id: string,
    @Body() dto: AdminOverrideDto,
  ) {
    return this.payments.adminOverride(id, dto.status, dto.adminNotes);
  }

  @Post('hosts/:hostProfileId/clear-match-fee-review')
  @HttpCode(HttpStatus.OK)
  async clearMatchFeeReview(
    @Param('hostProfileId') hostProfileId: string,
    @Body() dto: AdminWriteOffDto,
  ) {
    return this.payments.clearHostReviewFlag(hostProfileId, dto.adminNotes);
  }

}

function parseVerificationTab(
  raw?: string,
): 'PENDING_TAB' | 'VERIFIED' | 'REJECTED' {
  const s = raw?.trim();
  if (s === 'VERIFIED') return 'VERIFIED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'PENDING_TAB';
}
