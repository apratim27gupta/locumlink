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
import { ApplyJobDto, RespondToConfirmedPlacementDto } from './locum.dto.js';
interface JwtRequest {
  user: {
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
    return this.locumService.saveProfile(req.user.id, body);
  }
  @Get('profile')
  getProfile(
    @Req()
    req: JwtRequest,
  ) {
    return this.locumService.getProfile(req.user.id);
  }
  @Public()
  @Get('jobs/browse-count')
  async browseJobsCount() {
    const count = await this.locumService.countBrowseOpportunities();
    return { count };
  }
  @Get('jobs')
  browseJobs(@Query() query: Record<string, unknown>) {
    return this.locumService.browseJobs(query);
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
    return this.locumService.applyToJob(req.user.id, jobId, dto.coverNote);
  }
  @Get('applications')
  getMyApplications(
    @Req()
    req: JwtRequest,
    @Query()
    query: Record<string, unknown>,
  ) {
    return this.locumService.getMyApplications(req.user.id, query);
  }
  @Get('stats')
  getDashboardStats(
    @Req()
    req: JwtRequest,
  ) {
    return this.locumService.getDashboardStats(req.user.id);
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
      req.user.id,
      applicationId,
      dto.response,
    );
  }
}
