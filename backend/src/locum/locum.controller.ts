import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LocumService } from './locum.service.js';
import { ApplyJobDto, RespondToConfirmedPlacementDto, UpdateAvailabilityDto } from './locum.dto.js';
interface JwtRequest {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}
@Controller('locum')
@UseGuards(JwtAuthGuard)
@Roles(Role.LOCUM)
export class LocumController {
  constructor(private readonly locumService: LocumService) {}
  @Post('profile')
  @HttpCode(HttpStatus.OK)
  saveProfile(
    @Req()
    req: JwtRequest,
    @Body()
    body: Record<string, unknown>,
  ) {
    return this.locumService.saveProfile(req.user!.id, body);
  }
  @Get('profile')
  getProfile(
    @Req()
    req: JwtRequest,
  ) {
    return this.locumService.getProfile(req.user!.id);
  }
  @Public()
  @Get('jobs/browse-count')
  async browseJobsCount(@Req() req: JwtRequest) {
    const count = await this.locumService.countBrowseOpportunities(
      req.user?.email,
    );
    return { count };
  }
  @Public()
  @Get('jobs')
  browseJobs(
    @Req() req: JwtRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.locumService.browseJobs(query, {
      redactHostDetails: !req.user,
      viewerEmail: req.user?.email,
    });
  }
  @Post('jobs/:jobId/apply')
  applyToJob(
    @Req()
    req: JwtRequest,
    @Param('jobId')
    jobId: string,
    @Body()
    dto: ApplyJobDto,
  ) {
    return this.locumService.applyToJob(req.user!.id, jobId, {
      coverNote: dto.coverNote,
      availabilityKind: dto.availabilityKind,
      availableDates: dto.availableDates,
      shiftIds: dto.shiftIds,
    });
  }
  @Get('applications')
  getMyApplications(
    @Req()
    req: JwtRequest,
    @Query()
    query: Record<string, unknown>,
  ) {
    return this.locumService.getMyApplications(req.user!.id, query);
  }
  @Get('stats')
  getDashboardStats(
    @Req()
    req: JwtRequest,
  ) {
    return this.locumService.getDashboardStats(req.user!.id);
  }
  @Patch('applications/:applicationId/availability')
  @HttpCode(HttpStatus.OK)
  updateAvailability(
    @Req()
    req: JwtRequest,
    @Param('applicationId')
    applicationId: string,
    @Body()
    dto: UpdateAvailabilityDto,
  ) {
    return this.locumService.updateApplicationAvailability(
      req.user!.id,
      applicationId,
      {
        availabilityKind: dto.availabilityKind,
        availableDates: dto.availableDates,
        shiftIds: dto.shiftIds,
      },
    );
  }
  @Patch('applications/:applicationId/withdraw')
  @HttpCode(HttpStatus.OK)
  withdrawApplication(
    @Req()
    req: JwtRequest,
    @Param('applicationId')
    applicationId: string,
  ) {
    return this.locumService.withdrawApplication(
      req.user!.id,
      applicationId,
    );
  }
  @Patch('applications/:applicationId/respond')
  @HttpCode(HttpStatus.OK)
  respondToConfirmedPlacement(
    @Req()
    req: JwtRequest,
    @Param('applicationId')
    applicationId: string,
    @Body()
    dto: RespondToConfirmedPlacementDto,
  ) {
    return this.locumService.respondToConfirmedPlacement(
      req.user!.id,
      applicationId,
      dto.response,
    );
  }
}
