import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt, { type SignOptions } from 'jsonwebtoken';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { requireAdmin } from '../middleware/auth.js';
import { auditLogService } from '../services/AuditLogService.js';

export const authRouter = Router();

const loginLimit = rateLimit({ windowMs: 60_000, max: 8, standardHeaders: true, legacyHeaders: false });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', loginLimit, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { email: input.email } });
    if (!admin || !admin.isActive || !(await argon2.verify(admin.passwordHash, input.password))) {
      return res.status(401).json({ message: 'Identifiants invalides' });
    }

    const payload = { kind: 'admin', id: admin.id, email: admin.email, name: admin.name };
    const signOptions: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    const token = jwt.sign(payload, env.JWT_SECRET, signOptions);
    await auditLogService.log({ adminUserId: admin.id, action: 'login', entity: 'admin_users', entityId: admin.id, ipAddress: req.ip });
    return res.json({ token, admin: payload });
  } catch (error) {
    return next(error);
  }
});

authRouter.get('/me', requireAdmin, async (req, res) => {
  res.json({ admin: req.admin });
});

authRouter.post('/user-login', loginLimit, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive || !user.portalEnabled || !user.passwordHash || !(await argon2.verify(user.passwordHash, input.password))) {
      return res.status(401).json({ message: 'Identifiants invalides' });
    }

    const payload = { kind: 'user', id: user.id, email: user.email, displayName: user.displayName };
    const signOptions: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    const token = jwt.sign(payload, env.JWT_SECRET, signOptions);
    await auditLogService.log({ action: 'login', entity: 'users', entityId: user.id, ipAddress: req.ip });
    return res.json({ token, user: payload });
  } catch (error) {
    return next(error);
  }
});
