import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAdminGuard extends AuthGuard('google-admin') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: any) {
    const clientId = this.config.get<string>('GOOGLE_ADMIN_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('GOOGLE_ADMIN_CLIENT_SECRET')?.trim();
    const callback = this.config.get<string>('GOOGLE_ADMIN_CALLBACK_URL')?.trim();

    if (!clientId || !clientSecret || !callback) {
      throw new ServiceUnavailableException(
        'Admin Google OAuth is not configured. Set GOOGLE_ADMIN_CLIENT_ID, GOOGLE_ADMIN_CLIENT_SECRET, GOOGLE_ADMIN_CALLBACK_URL in backend/.env(.staging).',
      );
    }

    return super.canActivate(context) as any;
  }
}

