import { Router } from 'express';
import { z } from 'zod';
import { murmurService } from '../services/MurmurService.js';
import { syncService } from '../services/SyncService.js';
import { auditLogService } from '../services/AuditLogService.js';

export const murmurRouter = Router();

murmurRouter.post('/sync/murmur', async (req, res, next) => {
  try {
    const snapshot = await syncService.syncToMurmur();
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'sync', entity: 'murmur', newValue: snapshot as any, ipAddress: req.ip });
    req.app.get('io')?.emit('sync.completed', { at: new Date().toISOString() });
    res.json({ ok: true, snapshot });
  } catch (error) {
    req.app.get('io')?.emit('sync.error', { message: error instanceof Error ? error.message : 'Sync error' });
    next(error);
  }
});

murmurRouter.get('/murmur/status', async (_req, res, next) => {
  try {
    res.json(await murmurService.status());
  } catch (error) {
    next(error);
  }
});

murmurRouter.get('/murmur/users', async (_req, res, next) => {
  try {
    res.json(await murmurService.users());
  } catch (error) {
    next(error);
  }
});

murmurRouter.get('/murmur/channels', async (_req, res, next) => {
  try {
    res.json(await murmurService.channels());
  } catch (error) {
    next(error);
  }
});

murmurRouter.post('/murmur/users/:id/mute', async (req, res, next) => {
  try {
    const body = z.object({ mute: z.boolean().default(true) }).parse(req.body);
    await murmurService.mute(Number(req.params.id), body.mute);
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'murmur_action', entity: 'mute', entityId: req.params.id, newValue: body, ipAddress: req.ip });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

murmurRouter.post('/murmur/users/:id/deafen', async (req, res, next) => {
  try {
    const body = z.object({ deaf: z.boolean().default(true) }).parse(req.body);
    await murmurService.deafen(Number(req.params.id), body.deaf);
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'murmur_action', entity: 'deafen', entityId: req.params.id, newValue: body, ipAddress: req.ip });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

murmurRouter.post('/murmur/users/:id/move', async (req, res, next) => {
  try {
    const body = z.object({ channelId: z.number().int() }).parse(req.body);
    await murmurService.move(Number(req.params.id), body.channelId);
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'murmur_action', entity: 'move', entityId: req.params.id, newValue: body, ipAddress: req.ip });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
