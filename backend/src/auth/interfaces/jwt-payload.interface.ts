// src/auth/interfaces/jwt-payload.interface.ts
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string; // user.id (cuid)
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
