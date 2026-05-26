import type { AuditAction } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export class AuditLogService {
  async log(input: {
    adminUserId?: string;
    action: AuditAction;
    entity: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldValue: input.oldValue as any,
        newValue: input.newValue as any,
        ipAddress: input.ipAddress
      }
    });
  }
}

export const auditLogService = new AuditLogService();
