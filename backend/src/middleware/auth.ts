import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ message: 'Token manquant' });

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Express.Request['admin'] & { kind?: string };
    if (payload.kind && payload.kind !== 'admin') return res.status(403).json({ message: 'Accès admin requis' });
    req.admin = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Token invalide' });
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ message: 'Token manquant' });

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Express.Request['user'] & { kind?: string };
    if (payload.kind !== 'user') return res.status(403).json({ message: 'Accès utilisateur requis' });
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Token invalide' });
  }
}
