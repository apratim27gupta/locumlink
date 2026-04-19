import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LocumService } from './locum.service.js';
import { ApplyJobDto } from './locum.dto.js';

interface JwtRequest {
  user: { id: string; email: string; role: string };
}

@Controller('locum')
@UseGuards(AuthGuard('jwt'))
export class LocumController {
  constructor(private readonly locumService: LocumService) {}

  // ── Profile ───────────────────────────────────────────────────────────────

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  saveProfile(@Req() req: JwtRequest, @Body() body: Record<string, unknown>) {
    return this.locumService.saveProfile(req.user.id, body);
  }

  @Get('profile')
  getProfile(@Req() req: JwtRequest) {
    return this.locumService.getProfile(req.user.id);
  }

  // ── Browse jobs ───────────────────────────────────────────────────────────

  @Get('jobs')
  browseJobs() {
    return this.locumService.browseJobs();
  }

  // ── Apply ─────────────────────────────────────────────────────────────────

  @Post('jobs/:jobId/apply')
  applyToJob(
    @Req() req: JwtRequest,
    @Param('jobId') jobId: string,
    @Body() dto: ApplyJobDto,
  ) {
    return this.locumService.applyToJob(req.user.id, jobId, dto.coverNote);
  }

  // ── My applications ───────────────────────────────────────────────────────

  @Get('applications')
  getMyApplications(@Req() req: JwtRequest) {
    return this.locumService.getMyApplications(req.user.id);
  }
}
