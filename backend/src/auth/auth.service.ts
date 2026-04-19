// src/auth/auth.service.ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';

import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { AuthTokens } from './interfaces/auth-tokens.interface.js';

const BCRYPT_ROUNDS = 12;

/** Real Supabase keys are JWT-shaped; placeholders break getUser() if picked over the anon key. */
function isPlaceholderSupabaseKey(key: string | undefined): boolean {
  const s = key?.trim() ?? '';
  if (!s) return true;
  if (/^local-dev/i.test(s)) return true;
  if (/^your-supabase-/i.test(s)) return true;
  return s.length < 80;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ── Registration ──────────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role,
      },
    });

    // PIPEDA – log account creation (AuditService.log is void / fire-and-forget)
    this.audit.log({
      actorId: user.id,
      subjectId: user.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      after: { email: user.email, role: user.role },
      ...meta,
    });

    return this.issueTokens(user);
  }

  // ── Login ─────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const user = await this.validateCredentials(dto.email, dto.password);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // PIPEDA – log successful login
    this.audit.log({
      actorId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ...meta,
    });

    return this.issueTokens(user);
  }

  // ── Credential validation (used by LocalStrategy) ─────────────────

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE' && user.status !== 'PENDING') {
      throw new UnauthorizedException('Account suspended or deactivated');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  // ── Token validation (used by JwtStrategy) ────────────────────────

  async validateJwtPayload(payload: JwtPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new UnauthorizedException('Session invalid');
    }

    return user;
  }

  /**
   * Exchange a Supabase access token (after email OTP) for Locum Link JWTs,
   * or re-issue tokens if the client already sent our own access token.
   */
  async syncFromSupabaseToken(
    authorizationHeader: string | undefined,
    roleHint: Role,
  ): Promise<AuthTokens> {
    const raw = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!raw) {
      throw new UnauthorizedException('Missing Authorization bearer token');
    }

    const supabaseUrl = (
      this.config.get<string>('SUPABASE_URL') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_URL') ??
      ''
    ).trim();
    const serviceKeyRaw = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = (
      this.config.get<string>('SUPABASE_ANON_KEY') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
      ''
    ).trim();

    // Prefer service_role only when it looks real; anon key is sufficient for getUser(access_token).
    const sbKey = !isPlaceholderSupabaseKey(serviceKeyRaw)
      ? serviceKeyRaw!.trim()
      : anonKey;

    if (supabaseUrl && sbKey && !isPlaceholderSupabaseKey(sbKey)) {
      try {
        const sb = createClient(supabaseUrl, sbKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await sb.auth.getUser(raw);
        if (!error && data.user?.email) {
          const user = await this.findOrCreateUserForSupabase(
            data.user.email.toLowerCase(),
            roleHint,
          );
          return this.issueTokens(user);
        }
      } catch {
        // Supabase lookup failed — fall through to JWT verify below
      }
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(raw);
      const user = await this.validateJwtPayload(payload);
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException(
        'Invalid session. For OTP login, set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_*) to the same Supabase project as the frontend; do not use a placeholder SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
  }

  private async findOrCreateUserForSupabase(
    email: string,
    roleHint: Role,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Same email may have signed up earlier as locum vs clinic. The UI + Next
      // `/api/host/*` routes expect `role: HOST` in the JWT; returning the old
      // role caused 401 on host profile → clearSession → redirect to /auth.
      if (
        existing.role !== roleHint &&
        existing.role !== Role.ADMIN
      ) {
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { role: roleHint },
        });
      }
      return existing;
    }

    const passwordHash = await bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: roleHint,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  // ── Token issuance ────────────────────────────────────────────────

  private issueTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwt.sign(payload);

    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
        '30d',
      ) as StringValue,
    });

    return { accessToken, refreshToken };
  }
}
