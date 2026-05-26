import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { syncService } from '../services/SyncService.js';
import { auditLogService } from '../services/AuditLogService.js';

export const logsPresetsRouter = Router();

logsPresetsRouter.get('/logs', async (_req, res, next) => {
  try {
    res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { adminUser: true } }));
  } catch (error) {
    next(error);
  }
});

logsPresetsRouter.get('/presets', async (_req, res, next) => {
  try {
    res.json(await prisma.preset.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (error) {
    next(error);
  }
});

logsPresetsRouter.post('/presets', async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().min(1), description: z.string().optional() }).parse(req.body);
    const snapshot = await syncService.buildSnapshot();
    const preset = await prisma.preset.create({ data: { ...body, snapshot: snapshot as any } });
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'create', entity: 'presets', entityId: preset.id, newValue: preset as any, ipAddress: req.ip });
    res.status(201).json(preset);
  } catch (error) {
    next(error);
  }
});

logsPresetsRouter.post('/presets/:id/apply', async (req, res, next) => {
  try {
    const preset = await prisma.preset.findUniqueOrThrow({ where: { id: req.params.id } });
    const snapshot = preset.snapshot as any;
    await prisma.$transaction([
      prisma.roleRoomPermission.deleteMany(),
      prisma.userPermissionOverride.deleteMany(),
      prisma.roleRoomPermission.createMany({ data: snapshot.rolePermissions ?? [], skipDuplicates: true }),
      prisma.userPermissionOverride.createMany({ data: snapshot.overrides ?? [], skipDuplicates: true })
    ]);
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'preset_apply', entity: 'presets', entityId: preset.id, newValue: preset as any, ipAddress: req.ip });
    req.app.get('io')?.emit('permissions.modified', { scope: 'preset', presetId: preset.id });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
