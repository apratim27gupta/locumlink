import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
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
import { AdminService } from './admin.service.js';
import { AdminReportActionDto } from './dto/admin-report-action.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { AdminUpdateVerificationDto } from './dto/admin-update-verification.dto.js';

@Public()
@UseGuards(AdminJwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly adminNotifications: AdminNotificationsService,
  ) {}

  @Get('stats')
  async stats(@CurrentAdmin() admin: AdminJwtPayload) {
    const stats = await this.admin.stats();
    return { admin, stats };
  }

  @Get('analytics/summary')
  async analyticsSummary() {
    return this.admin.analyticsSummary();
  }

  @Get('analytics/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportAnalytics(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Res() res: Response,
  ) {
    const csv = await this.admin.exportAnalyticsCsv(req, admin);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="locumlink-analytics-${date}.csv"`,
    );
    return res.status(200).send(`\uFEFF${csv}`);
  }

  @Get('reports')
  async reports(@Query('status') status?: string) {
    return this.admin.listReports({ status });
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
  ) {
    return this.admin.listUsers({
      q,
      page,
      pageSize: Math.min(Math.max(pageSize, 1), 200),
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

}

function parseVerificationTab(
  raw?: string,
): 'PENDING_TAB' | 'VERIFIED' | 'REJECTED' {
  const s = raw?.trim();
  if (s === 'VERIFIED') return 'VERIFIED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'PENDING_TAB';
}
