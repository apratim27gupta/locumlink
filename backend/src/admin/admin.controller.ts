import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator.js';
import type { AdminJwtPayload } from '../admin-auth/admin-auth.types.js';
import { VerificationStatus } from '@prisma/client';

@Public()
@UseGuards(AdminJwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats(@CurrentAdmin() admin: AdminJwtPayload) {
    const [users, pendingVerifications] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.locumProfile.count({ where: { verificationStatus: VerificationStatus.PENDING_REVIEW } }),
    ]);

    return {
      admin,
      stats: {
        totalUsers: users,
        pendingVerifications,
      },
    };
  }
}

