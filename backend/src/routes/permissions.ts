import { Router } from 'express';
import { z } from 'zod';
import { permissionMatrixService, selectablePermissions } from '../services/PermissionMatrixService.js';
import { auditLogService } from '../services/AuditLogService.js';

export const permissionsRouter = Router();

const permissionSchema = z.enum(selectablePermissions as [string, ...string[]]);

permissionsRouter.get('/permissions/matrix', async (_req, res, next) => {
  try {
    res.json(await permissionMatrixService.getRoleMatrix());
  } catch (error) {
    next(error);
  }
});

permissionsRouter.patch('/permissions/matrix', async (req, res, next) => {
  try {
    const entries = z.array(z.object({ roleId: z.string(), roomId: z.string(), permission: permissionSchema })).parse(req.body.entries);
    const result = await permissionMatrixService.patchRoleMatrix(entries as any);
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'update', entity: 'role_room_permissions', newValue: entries, ipAddress: req.ip });
    req.app.get('io')?.emit('permissions.modified', { scope: 'roles' });
    res.json({ updated: result.length });
  } catch (error) {
    next(error);
  }
});

permissionsRouter.get('/overrides', async (_req, res, next) => {
  try {
    res.json(await permissionMatrixService.getOverrides());
  } catch (error) {
    next(error);
  }
});

permissionsRouter.patch('/overrides', async (req, res, next) => {
  try {
    const entries = z.array(z.object({ userId: z.string(), roomId: z.string(), permission: permissionSchema, reason: z.string().optional() })).parse(req.body.entries);
    const result = await permissionMatrixService.patchOverrides(entries as any);
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'update', entity: 'user_permission_overrides', newValue: entries, ipAddress: req.ip });
    req.app.get('io')?.emit('permissions.modified', { scope: 'users' });
    res.json({ updated: result.length });
  } catch (error) {
    next(error);
  }
});
