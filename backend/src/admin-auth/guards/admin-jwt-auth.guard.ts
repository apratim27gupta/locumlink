import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ADMIN_JWT_STRATEGY } from '../admin-auth.constants.js';

@Injectable()
export class AdminJwtAuthGuard extends AuthGuard(ADMIN_JWT_STRATEGY) {
  handleRequest<TUser = any>(err: unknown, user: TUser | false | null) {
    if (err) throw err;
    if (!user) throw new UnauthorizedException('Admin authentication required');
    return user;
  }

  // Ensure cookies are accessible in strategy via req.cookies
  getRequest(context: ExecutionContext) {
    return context.switchToHttp().getRequest();
  }
}

