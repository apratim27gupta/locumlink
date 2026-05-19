import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
    AuditAction,
    PostingStatus,
    Role,
    UserStatus,
    VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminJwtPayload } from '../admin-auth/admin-auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';

const VERIFICATION_PENDING_FILTER: VerificationStatus[] = [
    VerificationStatus.UNVERIFIED,
    VerificationStatus.PENDING_REVIEW,
];

function formatAuditDetail(params: {
    before?: unknown;
    after?: unknown;
}): string {
    const before = params.before;
    const after = params.after;
    if (
        before &&
        after &&
        typeof before === 'object' &&
        typeof after === 'object' &&
        !Array.isArray(before) &&
        !Array.isArray(after)
    ) {
        const b = before as Record<string, unknown>;
        const a = after as Record<string, unknown>;
        const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
        const parts: string[] = [];
        for (const k of keys) {
            const bv = JSON.stringify(b[k]);
            const av = JSON.stringify(a[k]);
            if (bv !== av)
                parts.push(`${k}: ${bv} → ${av}`);
        }
        if (parts.length)
            return parts.join('; ');
    }
    if (typeof after === 'object' && after !== null)
        return JSON.stringify(after);
    return '';
}

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: AuditService,
    ) {}

    async stats(): Promise<{
        totalUsers: number;
        hostUsers: number;
        locumUsers: number;
        pendingVerifications: number;
        activeJobPostings: number;
    }> {
        const [roleGroups, pendingVerifications, activeJobPostings] = await Promise.all([
            this.prisma.user.groupBy({
                by: ['role'],
                _count: { id: true },
            }),
            this.prisma.locumProfile.count({
                where: { verificationStatus: VerificationStatus.PENDING_REVIEW },
            }),
            this.prisma.jobPosting.count({
                where: { status: PostingStatus.ACTIVE, isDeleted: false },
            }),
        ]);
        let hostUsers = 0;
        let locumUsers = 0;
        let totalUsers = 0;
        for (const g of roleGroups) {
            totalUsers += g._count.id;
            if (g.role === Role.HOST) hostUsers = g._count.id;
            if (g.role === Role.LOCUM) locumUsers = g._count.id;
        }
        return {
            totalUsers,
            hostUsers,
            locumUsers,
            pendingVerifications,
            activeJobPostings,
        };
    }

    async listUsers(params: {
        q?: string;
        page: number;
        pageSize: number;
    }) {
        const skip = Math.max(0, (params.page - 1) * params.pageSize);
        const q = params.q?.trim();
        const where = q
            ? {
                  email: { contains: q, mode: 'insensitive' as const },
              }
            : undefined;
        const [total, users] = await Promise.all([
            this.prisma.user.count({ where }),
            this.prisma.user.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: params.pageSize,
                select: {
                    id: true,
                    email: true,
                    role: true,
                    status: true,
                    createdAt: true,
                    lastLoginAt: true,
                },
            }),
        ]);
        return {
            total,
            page: params.page,
            pageSize: params.pageSize,
            users: users.map((u) => ({
                ...u,
                createdAt: u.createdAt.toISOString(),
                lastLoginAt: u.lastLoginAt
                    ? u.lastLoginAt.toISOString().slice(0, 10)
                    : null,
            })),
        };
    }

    async exportUsersCsv(q?: string): Promise<string> {
        const where = q?.trim()
            ? { email: { contains: q.trim(), mode: 'insensitive' as const } }
            : undefined;
        const users = await this.prisma.user.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 10_000,
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                lastLoginAt: true,
            },
        });
        const header = ['id', 'email', 'role', 'status', 'createdAt', 'lastLoginAt'].join(',');
        const lines = users.map((u) =>
            [
                u.id,
                csvEscape(u.email),
                u.role,
                u.status,
                u.createdAt.toISOString(),
                u.lastLoginAt?.toISOString() ?? '',
            ].join(','),
        );
        return [header, ...lines].join('\n');
    }

    async updateUser(
        req: Request,
        adminPayload: AdminJwtPayload,
        userId: string,
        dto: AdminUpdateUserDto,
    ) {
        const existing = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!existing)
            throw new NotFoundException('User not found');
        if (dto.status === undefined && dto.role === undefined)
            throw new BadRequestException('Nothing to update');
        const beforePick = pickUserAudit(existing);

        try {
            const updated = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    ...(dto.status !== undefined ? { status: dto.status } : {}),
                    ...(dto.role !== undefined ? { role: dto.role } : {}),
                },
            });
            const afterPick = pickUserAudit(updated);
            this.audit.log({
                adminActorId: adminPayload.sub,
                subjectId: updated.id,
                action: AuditAction.UPDATE,
                entity: 'User',
                entityId: updated.id,
                before: beforePick,
                after: afterPick,
                ip: extractIp(req),
                userAgent: req.headers['user-agent'],
                endpoint: `${req.method} ${req.originalUrl}`,
            });
            return {
                id: updated.id,
                email: updated.email,
                role: updated.role,
                status: updated.status,
                createdAt: updated.createdAt.toISOString(),
                lastLoginAt: updated.lastLoginAt
                    ? updated.lastLoginAt.toISOString().slice(0, 10)
                    : null,
            };
        }
        catch (err: unknown) {
            throw new ConflictException(
                String(
                    err && typeof err === 'object' && 'message' in err
                        ? (err as { message: unknown }).message
                        : err,
                ),
            );
        }
    }

    async listVerifications(params: {
        filter:
            | 'PENDING_TAB'
            | VerificationStatus.VERIFIED
            | VerificationStatus.REJECTED;
    }) {
        const where =
            params.filter === 'PENDING_TAB'
                ? {
                      verificationStatus: {
                          in: VERIFICATION_PENDING_FILTER,
                      },
                  }
                : { verificationStatus: params.filter };
        const rows = await this.prisma.locumProfile.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 200,
            include: {
                user: { select: { email: true } },
            },
        });
        return rows.map((p) => {
            const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
                || '—';
            return {
                id: p.id,
                userId: p.userId,
                email: p.user.email,
                name,
                cpsns: p.cpsnsId,
                submittedAt: p.updatedAt.toISOString(),
                verificationStatus: p.verificationStatus,
            };
        });
    }

    async updateLocumVerification(
        req: Request,
        adminPayload: AdminJwtPayload,
        locumProfileId: string,
        nextStatus: VerificationStatus.VERIFIED | VerificationStatus.REJECTED,
    ) {
        const profile = await this.prisma.locumProfile.findUnique({
            where: { id: locumProfileId },
            include: { user: { select: { email: true } } },
        });
        if (!profile)
            throw new NotFoundException('Locum profile not found');
        const before = {
            verificationStatus: profile.verificationStatus,
            verifiedAt: profile.verifiedAt?.toISOString() ?? null,
        };
        const updated = await this.prisma.locumProfile.update({
            where: { id: locumProfileId },
            data: {
                verificationStatus: nextStatus,
                verifiedAt: nextStatus === VerificationStatus.VERIFIED
                    ? new Date()
                    : null,
            },
        });
        const after = {
            verificationStatus: updated.verificationStatus,
            verifiedAt: updated.verifiedAt?.toISOString() ?? null,
        };
        this.audit.log({
            adminActorId: adminPayload.sub,
            subjectId: profile.userId,
            action: AuditAction.STATUS_CHANGE,
            entity: 'LocumProfile',
            entityId: profile.id,
            before,
            after,
            ip: extractIp(req),
            userAgent: req.headers['user-agent'],
            endpoint: `${req.method} ${req.originalUrl}`,
        });
        const name = [updated.firstName, updated.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || '—';
        return {
            id: updated.id,
            userId: updated.userId,
            email: profile.user.email,
            name,
            cpsns: updated.cpsnsId,
            submittedAt: updated.updatedAt.toISOString(),
            verificationStatus: updated.verificationStatus,
        };
    }

    async listAuditLogs(params: { q?: string; take: number }) {
        const q = params.q?.trim();
        const rows = await this.prisma.auditLog.findMany({
            where: q
                ? {
                      OR: [
                          { entity: { contains: q, mode: 'insensitive' } },
                          {
                              entityId: {
                                  contains: q,
                                  mode: 'insensitive',
                              },
                          },
                      ],
                  }
                : undefined,
            orderBy: { createdAt: 'desc' },
            take: params.take,
            include: {
                actor: { select: { email: true } },
                adminActor: { select: { email: true } },
            },
        });
        return rows.map((r) => ({
            id: r.id,
            actor:
                r.adminActor?.email
                ?? r.actor?.email
                ?? '—',
            action: r.action,
            entity: r.entity,
            createdAt: r.createdAt.toISOString(),
            detail: formatAuditDetail({ before: r.before, after: r.after }),
        }));
    }
}

function pickUserAudit(u: {
    status: UserStatus;
    role: Role;
}) {
    return { status: u.status, role: u.role };
}

function extractIp(req: Request): string | undefined {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length)
        return xf.split(',')[0]?.trim();
    return req.ip;
}

function csvEscape(s: string): string {
    if (/[",\n]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
