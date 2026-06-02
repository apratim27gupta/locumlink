import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service.js';
import { PushService } from './push.service.js';

interface JwtRequest {
  user: { id: string; email: string; role: string };
}

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  @Get()
  getNotifications(@Req() req: JwtRequest) {
    return this.notificationsService.getNotifications(
      req.user.id,
      req.user.role,
    );
  }

  @Patch('read-all')
  markAllRead(@Req() req: JwtRequest) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.notificationsService.markRead(req.user.id, id);
  }

  @Post('push/subscribe')
  subscribe(
    @Req() req: JwtRequest,
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.pushService.saveSubscription(req.user.id, body);
  }

  @Delete('push/unsubscribe')
  unsubscribe(@Body() body: { endpoint: string }) {
    return this.pushService.deleteSubscription(body.endpoint);
  }

  @Get('push/vapid-public-key')
  getVapidKey() {
    return { key: process.env.VAPID_PUBLIC_KEY };
  }
}
