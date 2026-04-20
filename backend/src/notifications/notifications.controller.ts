import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

interface JwtRequest {
  user: { id: string; email: string; role: string };
}

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getNotifications(@Req() req: JwtRequest) {
    return this.notificationsService.getNotifications(
      req.user.id,
      req.user.role,
    );
  }
}
