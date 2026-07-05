import { Router } from 'express';
import { z } from 'zod';
import { gs } from '../utils/settings';
import { env } from '../config/env';
import { asyncHandler, HttpError } from '../middleware/error';
import { ok } from '../utils/response';
import { logger } from '../utils/logger';

const router = Router();

const schema = z.object({
  player_id: z.string().min(1),
  provider_product_id: z.string().optional(),
  server_id: z.string().optional(),
});

// POST /api/uid-checker — resolve a player's nickname via TopupNet.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { player_id, provider_product_id, server_id } = schema.parse(req.body);

    const s = await gs();
    const apiKey = s.str('free_fire_server_api_key') || env.TOPUPNET_API_KEY;
    const baseUrl = (s.str('free_fire_server_url') || env.TOPUPNET_BASE_URL).replace(
      /\/+$/,
      '',
    );
    if (!baseUrl) throw new HttpError(503, 'UID checker is not configured.');

    const payload: Record<string, string> = { playerid: String(player_id) };
    if (provider_product_id) payload.pacakge = provider_product_id;
    if (server_id) payload.serverid = server_id;

    try {
      const resp = await fetch(`${baseUrl}/check?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await resp.json().catch(() => ({}))) as any;

      const nickname = data?.nickname ?? data?.username ?? data?.name ?? null;
      if (!resp.ok || !nickname) {
        throw new HttpError(422, data?.message || 'Could not verify this Player ID.');
      }
      return ok(res, { player_id, nickname });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      logger.error(`UID checker error: ${(e as Error).message}`);
      throw new HttpError(502, 'UID checker service is unavailable.');
    }
  }),
);

export default router;
