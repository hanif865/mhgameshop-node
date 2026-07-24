import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { fail } from '../utils/response';

/**
 * Shared-secret auth for the Telegram top-up bot (server-to-server).
 *
 * The bot sends:  X-Bot-Key: <BOT_API_KEY>
 * Unlike requireAuth this is not a user session — the acting user is resolved
 * per-request from the `telegram_id` supplied by the bot.
 */
export function requireBotKey(req: Request, res: Response, next: NextFunction) {
  if (!env.BOT_API_KEY) return fail(res, 'Bot integration is not configured.', 503);

  const key = (req.headers['x-bot-key'] as string | undefined) ?? '';
  if (key !== env.BOT_API_KEY) return fail(res, 'Invalid bot key.', 401);

  next();
}
