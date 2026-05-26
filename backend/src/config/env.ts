import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MURMUR_HOST: z.string().default('127.0.0.1'),
  MURMUR_ICE_PORT: z.coerce.number().default(6502),
  MURMUR_ICE_SECRET_READ: z.string().optional(),
  MURMUR_ICE_SECRET_WRITE: z.string().optional(),
  MURMUR_VIRTUAL_SERVER_ID: z.coerce.number().default(1),
  MUMBLE_PUBLIC_HOST: z.string().default('mumble.remakemedia.fr'),
  MUMBLE_PUBLIC_PORT: z.coerce.number().default(64738),
  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('secret')
});

export const env = schema.parse(process.env);
export const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
