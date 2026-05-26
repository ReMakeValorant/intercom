import type { AdminUser } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      admin?: Pick<AdminUser, 'id' | 'email' | 'name'>;
      user?: { id: string; email?: string | null; displayName: string };
    }
  }
}
