import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ADMIN_AUTH_COOKIE, ADMIN_JWT_STRATEGY } from '../admin-auth.constants.js';
import type { AdminJwtPayload } from '../admin-auth.types.js';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, ADMIN_JWT_STRATEGY) {
  constructor(config: ConfigService) {
    super({
      secretOrKey: config.get<string>('ADMIN_JWT_SECRET') ?? config.getOrThrow<string>('JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { cookies?: Record<string, string> } | undefined) => req?.cookies?.[ADMIN_AUTH_COOKIE] ?? null,
      ]),
    });
  }

  async validate(payload: AdminJwtPayload) {
    return payload;
  }
}

