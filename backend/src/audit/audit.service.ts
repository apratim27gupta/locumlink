// src/audit/audit.service.ts
import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

interface LogParams {
  actorId?: string;
  subjectId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
}

/**
 * AuditService – write-only service for PIPEDA-compliant audit logging.
 * All writes are fire-and-forget (non-blocking) to avoid adding latency
 * to the main request path. Failures are swallowed and surfaced via
 * Sentry rather than bubbling up to the caller.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(params: LogParams): void {
    // Non-blocking: intentionally not awaited
    void this.prisma.auditLog
      .create({
        data: {
          actorId: params.actorId,
          subjectId: params.subjectId,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          before: params.before as never,
          after: params.after as never,
          ipAddress: params.ip,
          userAgent: params.userAgent,
          endpoint: params.endpoint,
        },
      })
      .catch((err: unknown) => {
        // Never throw – just surface via monitoring
        console.error('[AuditService] Failed to write audit log', err);
      });
  }
}
