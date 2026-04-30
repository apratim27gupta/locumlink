import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminJwtPayload } from '../admin-auth.types.js';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AdminJwtPayload }>();
    return req.user;
  },
);

