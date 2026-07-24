import 'dotenv/config';
import { z } from 'zod';

/**
 * Validate and normalize process.env once at boot. Import `env` everywhere
 * instead of reading process.env directly so misconfiguration fails fast.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  APP_URL: z.string().default('http://localhost:4000'),
  WEB_URL: z.string().default('http://localhost:3000'),
  ADMIN_URL: z.string().default('http://localhost:3001'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Cookie security. Set COOKIE_SECURE=false for plain-HTTP (IP-only) deploys,
  // otherwise the auth cookie won't be sent by the browser. Defaults to true
  // in production (HTTPS), false in development.
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v.toLowerCase() === 'true')),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default('http://localhost:4000/api/auth/google/callback'),

  TOPUPNET_API_KEY: z.string().optional().default(''),
  TOPUPNET_BASE_URL: z.string().default('https://api.topupnet.com/api/v1'),

  UDDOKTAPAY_API_KEY: z.string().optional().default(''),
  UDDOKTAPAY_BASE_URL: z.string().optional().default(''),

  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),

  // Shared secret for the Telegram top-up bot (server-to-server, /api/bot/*).
  // Empty = bot integration disabled.
  BOT_API_KEY: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
