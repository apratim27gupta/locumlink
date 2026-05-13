import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, HttpCode, HttpStatus, } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { HostService } from './host.service.js';
import { SaveHostProfileDto, CreateJobDto, UpdateJobDto, UpdateApplicationDto, ReopenJobDto, } from './host.dto.js';
interface JwtRequest {
    user: {
        id: string;
        email: string;
        role: string;
    };
}
@Controller('host')
@UseGuards(AuthGuard('jwt'))
export class HostController {
    constructor(private readonly hostService: HostService) { }
    @Post('profile')
    @HttpCode(HttpStatus.OK)
    saveProfile(
    @Req()
    req: JwtRequest, 
    @Body()
    dto: SaveHostProfileDto) {
        return this.hostService.saveProfile(req.user.id, dto);
    }
    @Get('profile')
    getProfile(
    @Req()
    req: JwtRequest) {
        return this.hostService.getProfile(req.user.id);
    }
    @Get('stats')
    getDashboardStats(
    @Req()
    req: JwtRequest) {
        return this.hostService.getDashboardStats(req.user.id);
    }
    @Post('jobs')
    createJob(
    @Req()
    req: JwtRequest, 
    @Body()
    dto: CreateJobDto) {
        return this.hostService.createJob(req.user.id, dto);
    }
    @Get('jobs')
    getJobs(
    @Req()
    req: JwtRequest, 
    @Query('deleted')
    deleted?: string) {
        return this.hostService.getJobs(req.user.id, { deletedOnly: deleted === 'true' });
    }
    @Get('jobs/:id')
    getJob(
    @Req()
    req: JwtRequest, 
    @Param('id')
    id: string) {
        return this.hostService.getJob(req.user.id, id);
    }
    @Patch('jobs/:id')
    updateJob(
    @Req()
    req: JwtRequest, 
    @Param('id')
    id: string, 
    @Body()
    dto: UpdateJobDto) {
        return this.hostService.updateJob(req.user.id, id, dto);
    }
    @Delete('jobs/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteJob(
    @Req()
    req: JwtRequest, 
    @Param('id')
    id: string) {
        return this.hostService.deleteJob(req.user.id, id);
    }
    @Post('jobs/:id/reopen')
    reopenJob(
    @Req()
    req: JwtRequest, 
    @Param('id')
    id: string, 
    @Body()
    dto: ReopenJobDto) {
        return this.hostService.reopenJob(req.user.id, id, dto);
    }
    @Get('jobs/:jobId/applications')
    getApplications(
    @Req()
    req: JwtRequest, 
    @Param('jobId')
    jobId: string) {
        return this.hostService.getApplications(req.user.id, jobId);
    }
    @Patch('jobs/:jobId/applications/:appId')
    updateApplication(
    @Req()
    req: JwtRequest, 
    @Param('jobId')
    jobId: string, 
    @Param('appId')
    appId: string, 
    @Body()
    dto: UpdateApplicationDto) {
        return this.hostService.updateApplication(req.user.id, jobId, appId, dto.status);
    }
}
