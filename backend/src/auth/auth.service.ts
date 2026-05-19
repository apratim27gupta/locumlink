import { BadRequestException, ConflictException, Injectable, UnauthorizedException, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { GcsService } from '../gcs/gcs.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { AuthTokens } from './interfaces/auth-tokens.interface.js';
const BCRYPT_ROUNDS = 12;
function isPlaceholderSupabaseKey(key: string | undefined): boolean {
    const s = key?.trim() ?? '';
    if (!s)
        return true;
    if (/^local-dev/i.test(s))
        return true;
    if (/^your-supabase-/i.test(s))
        return true;
    if (s.startsWith('sb_publishable_'))
        return false;
    return s.length < 80;
}
@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService, private readonly audit: AuditService, private readonly gcs: GcsService) { }
    async register(dto: RegisterDto, meta: {
        ip?: string;
        userAgent?: string;
    }): Promise<AuthTokens> {
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
    async login(dto: LoginDto, meta: {
        ip?: string;
        userAgent?: string;
    }): Promise<AuthTokens> {
        const user = await this.validateCredentials(dto.email, dto.password);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        this.audit.log({
            actorId: user.id,
            action: 'LOGIN',
            entity: 'User',
            entityId: user.id,
            ...meta,
        });
        return this.issueTokens(user);
    }
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
    async validateJwtPayload(payload: JwtPayload): Promise<User> {
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
        });
        if (!user || user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
            throw new UnauthorizedException('Session invalid');
        }
        return user;
    }
    async syncFromSupabaseToken(authorizationHeader: string | undefined, roleHint: Role): Promise<AuthTokens> {
        const raw = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
        if (!raw) {
            throw new UnauthorizedException('Missing Authorization bearer token');
        }
        const supabaseUrl = (this.config.get<string>('SUPABASE_URL') ??
            this.config.get<string>('NEXT_PUBLIC_SUPABASE_URL') ??
            '').trim();
        const serviceKeyRaw = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        const anonKey = (this.config.get<string>('SUPABASE_ANON_KEY') ??
            this.config.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
            this.config.get<string>('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
            '').trim();
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
                    const user = await this.findOrCreateUserForSupabase(data.user.email.toLowerCase(), roleHint);
                    return this.issueTokens(user);
                }
            }
            catch {
            }
        }
        try {
            const payload = this.jwt.verify<JwtPayload>(raw);
            const user = await this.validateJwtPayload(payload);
            return this.issueTokens(user);
        }
        catch {
            throw new UnauthorizedException('Invalid session. For OTP login, set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_*) to the same Supabase project as the frontend; do not use a placeholder SUPABASE_SERVICE_ROLE_KEY.');
        }
    }
    async devOtpLogin(email: string | undefined, roleHint: Role): Promise<AuthTokens> {
        const normalizedEmail = email?.trim().toLowerCase();
        if (!normalizedEmail) {
            throw new BadRequestException('Email is required');
        }
        const user = await this.findOrCreateUserForSupabase(normalizedEmail, roleHint);
        return this.issueTokens(user);
    }
    private async findOrCreateUserForSupabase(email: string, roleHint: Role): Promise<User> {
        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing) {
            const data: Partial<Pick<User, 'role' | 'status' | 'emailVerified' | 'emailVerifiedAt' | 'lastLoginAt'>> = {
                status: 'ACTIVE',
                emailVerified: true,
                emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
                lastLoginAt: new Date(),
            };
            if (existing.role !== roleHint && existing.role !== Role.ADMIN) {
                data.role = roleHint;
            }
            return this.prisma.user.update({
                where: { id: existing.id },
                data,
            });
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
    async presentMe(user: User): Promise<Omit<User, 'passwordHash' | 'avatarStoragePath'> & {
        avatarUrl: string | null;
    }> {
        const { passwordHash: _, avatarStoragePath, ...rest } = user;
        const trimmed = avatarStoragePath?.trim() ?? '';
        const avatarUrl = trimmed.length > 0 ? await this.gcs.signedUrl(trimmed) : null;
        return { ...rest, avatarUrl };
    }
    async setUserAvatarStoragePath(userId: string, storagePath: string) {
        const next = storagePath.trim();
        if (!next)
            throw new BadRequestException('storagePath is required');
        const existing = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { avatarStoragePath: true },
        });
        if (existing?.avatarStoragePath &&
            existing.avatarStoragePath !== next) {
            await this.gcs.delete(existing.avatarStoragePath);
        }
        await this.prisma.user.update({
            where: { id: userId },
            data: { avatarStoragePath: next },
        });
    }
    async clearUserAvatar(userId: string): Promise<void> {
        const existing = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { avatarStoragePath: true },
        });
        const prev = existing?.avatarStoragePath?.trim() ?? '';
        if (prev)
            await this.gcs.delete(prev);
        await this.prisma.user.update({
            where: { id: userId },
            data: { avatarStoragePath: null },
        });
    }
    private issueTokens(user: User): AuthTokens {
        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };
        const accessToken = this.jwt.sign(payload);
        const refreshToken = this.jwt.sign(payload, {
            expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') as StringValue,
        });
        return { accessToken, refreshToken };
    }
}
