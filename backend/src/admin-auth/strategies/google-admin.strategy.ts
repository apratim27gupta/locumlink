import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleAdminStrategy extends PassportStrategy(Strategy, 'google-admin') {
  constructor(private readonly config: ConfigService) {
    // NOTE: passport-google-oauth20 throws at startup if clientID is missing.
    // We use non-empty placeholders so the backend can boot even before OAuth
    // is configured. The controller guard will block usage with a clear error.
    const clientID = config.get<string>('GOOGLE_ADMIN_CLIENT_ID')?.trim() || 'DISABLED';
    const clientSecret =
      config.get<string>('GOOGLE_ADMIN_CLIENT_SECRET')?.trim() || 'DISABLED';
    const callbackURL =
      config.get<string>('GOOGLE_ADMIN_CALLBACK_URL')?.trim() ||
      'http://localhost:3000/api/admin-auth/google/callback';
    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      displayName?: string;
      emails?: Array<{ value: string }>;
    },
  ) {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    const name = profile.displayName ?? '';
    return { email, name };
  }
}

