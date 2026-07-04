import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service.js';
import { PushService } from './push.service.js';
import { PushSubscribeDto, PushUnsubscribeDto } from './push.dto.js';
import {
  RegisterExpoPushDto,
  UnregisterExpoPushDto,
} from './expo-push.dto.js';

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
  getNotifications(
    @Req() req: JwtRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.notificationsService.getNotifications(
      req.user.id,
      req.user.role,
      query,
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
    @Body() body: PushSubscribeDto,
  ) {
    return this.pushService.saveSubscription(req.user.id, body);
  }

  @Delete('push/unsubscribe')
  unsubscribe(
    @Req() req: JwtRequest,
    @Body() body: PushUnsubscribeDto,
  ) {
    return this.pushService.deleteSubscription(req.user.id, body.endpoint);
  }

  @Get('push/vapid-public-key')
  getVapidKey() {
    return { key: process.env.VAPID_PUBLIC_KEY };
  }

  @Post('push/register-expo')
  registerExpo(
    @Req() req: JwtRequest,
    @Body() body: RegisterExpoPushDto,
  ) {
    return this.pushService.saveExpoToken(
      req.user.id,
      body.token,
      body.platform,
    );
  }

  @Delete('push/unregister-expo')
  unregisterExpo(
    @Req() req: JwtRequest,
    @Body() body: UnregisterExpoPushDto,
  ) {
    return this.pushService.deleteExpoToken(req.user.id, body.token);
  }
}
