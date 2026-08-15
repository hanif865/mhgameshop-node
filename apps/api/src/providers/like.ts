import { gs } from '../utils/settings';
import { logger } from '../utils/logger';
import * as amartopupbd from './autolike.provider';
import * as pinbot from './pinbotlike.provider';
import type { LikeResult } from './autolike.provider';

/**
 * Picks the Free Fire auto-like gateway at call time from the `like_gateway`
 * setting:
 *
 *   like_gateway = 'amartopupbd'  (default — unchanged behaviour)
 *                | 'pinbot'
 *
 * Everything else imports placeLikeOrder from here, so switching gateways is a
 * settings change, not a code change (mirrors providers/topup.ts).
 */
async function impl() {
  try {
    const s = await gs();
    const gateway = (s.str('like_gateway') || 'amartopupbd').trim().toLowerCase();
    if (gateway === 'pinbot') return pinbot;
  } catch (e) {
    logger.error(`⚠️ like_gateway lookup failed, using amartopupbd: ${(e as Error).message}`);
  }
  return amartopupbd;
}

export async function placeLikeOrder(order: any): Promise<LikeResult> {
  return (await impl()).placeLikeOrder(order);
}

export type { LikeResult };
