import type { ArgumentsHost } from '@nestjs/common';
import {
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminAuthService } from '../admin-auth.service.js';

/**
 * Failed admin Google Passport flow should land users on `/admin/login` with query hints,
 * not a JSON blob on the Nest host.
 */
@Catch(HttpException)
export class RedirectAdminOAuthToLoginFilter implements ExceptionFilter {
  constructor(private readonly adminAuth: AdminAuthService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();

    const responseBody = exception.getResponse();
    let reason: string;
    if (typeof responseBody === 'string') {
      reason = responseBody;
    } else {
      const msg = (responseBody as { message?: unknown }).message;
      if (Array.isArray(msg))
        reason = msg.filter((m) => typeof m === 'string').join(', ');
      else if (typeof msg === 'string') reason = msg;
      else reason = exception.message ?? 'OAuth failed';
    }
    reason = reason.slice(0, 480);

    if (status !== HttpStatus.UNAUTHORIZED && status !== HttpStatus.FORBIDDEN) {
      res.status(status).json(responseBody);
      return;
    }

    const errorParam =
      status === HttpStatus.FORBIDDEN ? 'not_allowed' : 'oauth';
    const redirect = this.adminAuth.buildAdminLoginUrl(errorParam, reason);
    res.redirect(HttpStatus.FOUND, redirect);
  }
}
