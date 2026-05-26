import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { prisma } from '../config/prisma.js';
import { auditLogService } from '../services/AuditLogService.js';

export const crudRouter = Router();

const userSchema = z.object({
  email: z.string().email().nullable().optional(),
  password: z.string().min(8).optional(),
  displayName: z.string().min(1),
  mumbleUserId: z.number().int().nullable().optional(),
  primaryRoleId: z.string().nullable().optional(),
  roleIds: z.array(z.string()).optional(),
  portalEnabled: z.boolean().optional(),
  isActive: z.boolean().optional()
});

const roleSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  color: z.string().default('#60a5fa'),
  sortOrder: z.number().int().default(0)
});

const roomSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  type: z.enum(['production', 'technique', 'externe', 'prive', 'help', 'other']).default('production'),
  murmurChannelId: z.number().int().nullable().optional()
});

function bindCrud(path: string, model: 'user' | 'role' | 'room', schema: z.AnyZodObject, include?: object) {
  const delegate = prisma[model] as any;

  crudRouter.get(path, async (_req, res, next) => {
    try {
      const orderBy = model === 'user' ? { displayName: 'asc' } : [{ sortOrder: 'asc' }, { name: 'asc' }];
      res.json(await delegate.findMany({ orderBy, include }));
    } catch (error) {
      next(error);
    }
  });

  crudRouter.post(path, async (req, res, next) => {
    try {
      const data = await normalizeModelData(model, schema.parse(req.body));
      const item = model === 'user'
        ? await createUserWithRoles(data)
        : await delegate.create({ data });
      await auditLogService.log({ adminUserId: req.admin?.id, action: 'create', entity: model, entityId: item.id, newValue: item, ipAddress: req.ip });
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  });

  crudRouter.patch(`${path}/:id`, async (req, res, next) => {
    try {
      const oldValue = await delegate.findUnique({ where: { id: req.params.id } });
      const data = await normalizeModelData(model, schema.partial().parse(req.body));
      const item = await delegate.update({ where: { id: req.params.id }, data });
      await auditLogService.log({ adminUserId: req.admin?.id, action: 'update', entity: model, entityId: item.id, oldValue, newValue: item, ipAddress: req.ip });
      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  crudRouter.delete(`${path}/:id`, async (req, res, next) => {
    try {
      const oldValue = await delegate.delete({ where: { id: req.params.id } });
      await auditLogService.log({ adminUserId: req.admin?.id, action: 'delete', entity: model, entityId: req.params.id, oldValue, ipAddress: req.ip });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

async function normalizeModelData(model: string, data: any) {
  if (model !== 'user') return data;
  const { password, ...rest } = data;
  return password ? { ...rest, passwordHash: await argon2.hash(password) } : rest;
}

async function createUserWithRoles(data: any) {
  const { roleIds, ...userData } = data;
  const user = await prisma.user.create({ data: userData });
  if (roleIds?.length) {
    await prisma.userRole.createMany({
      data: roleIds.map((roleId: string) => ({ userId: user.id, roleId })),
      skipDuplicates: true
    });
  }
  return prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { primaryRole: true, roles: { include: { role: true } }, mumbleAccounts: true } });
}

crudRouter.patch('/users/:id/roles', async (req, res, next) => {
  try {
    const body = z.object({ roleIds: z.array(z.string()) }).parse(req.body);
    const oldValue = await prisma.userRole.findMany({ where: { userId: req.params.id } });
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: req.params.id } }),
      prisma.userRole.createMany({
        data: body.roleIds.map((roleId) => ({ userId: req.params.id, roleId })),
        skipDuplicates: true
      })
    ]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, include: { primaryRole: true, roles: { include: { role: true } }, mumbleAccounts: true } });
    await auditLogService.log({ adminUserId: req.admin?.id, action: 'update', entity: 'user_roles', entityId: req.params.id, oldValue, newValue: body, ipAddress: req.ip });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

bindCrud('/users', 'user', userSchema, { primaryRole: true, roles: { include: { role: true } }, mumbleAccounts: true });
bindCrud('/roles', 'role', roleSchema);
bindCrud('/rooms', 'room', roomSchema, { parent: true, children: true });
