import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { HostService } from './host.service.js';

@Controller('public')
export class HostPublicController {
    constructor(private readonly hostService: HostService) { }

    @Public()
    @Get('recent-host-avatars')
    getRecentHostAvatars() {
        return this.hostService.getRecentHostAvatarUrls();
    }
}
