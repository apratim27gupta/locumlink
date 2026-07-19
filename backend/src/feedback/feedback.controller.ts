import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FeedbackService } from './feedback.service.js';

interface JwtRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Req() req: JwtRequest,
    @Body() body: { message?: string },
  ) {
    const message = typeof body?.message === 'string' ? body.message : '';
    if (!message.trim()) {
      throw new BadRequestException('Feedback message is required.');
    }
    return this.feedbackService.submit(req.user.id, message);
  }
}
