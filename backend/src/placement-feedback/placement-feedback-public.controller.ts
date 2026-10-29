import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlacementFeedbackService } from './placement-feedback.service.js';
import { SubmitPlacementFeedbackDto } from './placement-feedback.dto.js';

/** Tokenized email-link access - no host sign-in required. */
@Public()
@Controller('public/placement-feedback')
export class PlacementFeedbackPublicController {
  constructor(private readonly service: PlacementFeedbackService) {}

  @Get(':applicationId')
  get(
    @Param('applicationId') applicationId: string,
    @Query('token') token: string,
  ) {
    return this.service.getByAccessToken(applicationId, token);
  }

  @Post(':applicationId')
  @HttpCode(HttpStatus.OK)
  submit(
    @Param('applicationId') applicationId: string,
    @Query('token') token: string,
    @Body() dto: SubmitPlacementFeedbackDto,
  ) {
    return this.service.submitByAccessToken(applicationId, token, dto);
  }
}
