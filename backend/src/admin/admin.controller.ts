import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
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
import { AdminService } from './admin.service.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { AdminUpdateVerificationDto } from './dto/admin-update-verification.dto.js';

@Public()
@UseGuards(AdminJwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  async stats(@CurrentAdmin() admin: AdminJwtPayload) {
    const stats = await this.admin.stats();
    return { admin, stats };
  }

  @Get('users')
  async users(
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
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

  @Patch('verifications/:profileId')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async patchVerification(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Param('profileId') profileId: string,
    @Query('profileType') profileType: string | undefined,
    @Body() dto: AdminUpdateVerificationDto,
  ) {
    if (profileType === 'host') {
      return this.admin.updateHostVerification(req, admin, profileId, dto);
    }
    return this.admin.updateLocumVerification(req, admin, profileId, dto);
  }

  @Get('audit-logs')
  async auditLogs(
    @Query('q') q?: string,
    @Query('take', new DefaultValuePipe(200), ParseIntPipe) take: number,
  ) {
    return {
      items: await this.admin.listAuditLogs({
        q,
        take: Math.min(Math.max(take, 1), 500),
      }),
    };
  }
}

function parseVerificationTab(raw?: string): 'PENDING_TAB' | 'VERIFIED' | 'REJECTED' {
  const s = raw?.trim();
  if (s === 'VERIFIED') return 'VERIFIED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'PENDING_TAB';
}
