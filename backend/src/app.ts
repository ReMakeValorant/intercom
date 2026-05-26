import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';
import { corsOrigins } from './config/env.js';
import { requireAdmin } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { crudRouter } from './routes/crud.js';
import { portalRouter } from './routes/portal.js';
import { permissionsRouter } from './routes/permissions.js';
import { murmurRouter } from './routes/murmur.js';
import { logsPresetsRouter } from './routes/logs-presets.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use(portalRouter);
  app.use(requireAdmin);
  app.use(crudRouter);
  app.use(permissionsRouter);
  app.use(murmurRouter);
  app.use(logsPresetsRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ message: 'Validation error', issues: error.issues });
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ message });
  });

  return app;
}
