import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Resolves `GOOGLE_*` from merged env files (see `config/backend-env-files.ts`) or inherited `process.env`. */
@Injectable()
export class AdminGoogleEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  private credential(key: string): string | undefined {
    const proc = process.env[key];
    if (typeof proc === 'string' && proc.trim())
      return proc.trim();
    const fromConfig = this.config.get<string>(key);
    if (typeof fromConfig === 'string' && fromConfig.trim())
      return fromConfig.trim();
    return undefined;
  }

  canActivate(): boolean {
    const id = this.credential('GOOGLE_ADMIN_CLIENT_ID');
    const secret = this.credential('GOOGLE_ADMIN_CLIENT_SECRET');
    if (!id || !secret) {
      throw new ServiceUnavailableException(
        'Admin Google sign-in is not configured. Put GOOGLE_ADMIN_CLIENT_ID and GOOGLE_ADMIN_CLIENT_SECRET '
        + 'in backend/.env — they persist even under NODE_ENV=staging because .env loads together with '
        + '.env.staging. Set GOOGLE_ADMIN_CALLBACK_URL + Google Cloud redirect URI to '
        + 'your app origin + /api/admin-auth/google/callback (e.g. http://localhost:3002/api/admin-auth/google/callback).',
      );
    }
    return true;
  }
}
