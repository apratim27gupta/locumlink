import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PlacementFeedbackService } from './placement-feedback.service.js';
import { SubmitPlacementFeedbackDto } from './placement-feedback.dto.js';

interface JwtRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('host/placement-feedback')
@UseGuards(AuthGuard('jwt'))
@Roles(Role.HOST)
export class PlacementFeedbackController {
  constructor(private readonly service: PlacementFeedbackService) {}

  @Get(':applicationId')
  get(
    @Req() req: JwtRequest,
    @Param('applicationId') applicationId: string,
  ) {
    return this.service.getForHost(req.user.id, applicationId);
  }

  @Post(':applicationId')
  @HttpCode(HttpStatus.OK)
  submit(
    @Req() req: JwtRequest,
    @Param('applicationId') applicationId: string,
    @Body() dto: SubmitPlacementFeedbackDto,
  ) {
    return this.service.submitForHost(req.user.id, applicationId, dto);
  }
}
