import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../middleware/error';
import { ok } from '../utils/response';
import { logger } from '../utils/logger';

const router = Router();

// greentopup Free Fire UID check API (POST { uid } -> { player_info: { nickname, region, ... } }).
// Overridable via env so the endpoint can change without a redeploy.
const UID_CHECKER_URL =
  process.env.UID_CHECKER_URL || 'https://api.greentopup.com/ff/check-uid';

const schema = z.object({
  player_id: z.string().trim().min(1),
});

async function postWithRetry(url: string, body: unknown, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

// POST /api/uid-checker  { player_id } -> { nickname, region }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { player_id } = schema.parse(req.body);

    try {
      const resp = await postWithRetry(UID_CHECKER_URL, { uid: String(player_id) });
      const data = (await resp.json().catch(() => ({}))) as any;

      const info = data?.player_info ?? data?.data ?? data ?? {};
      const nickname = info?.nickname ?? data?.nickname ?? data?.name ?? null;

      if (!resp.ok || data?.success === false || !nickname) {
        throw new HttpError(422, 'Could not verify this Player ID.');
      }

      return ok(res, {
        player_id,
        nickname,
        region: info?.region ?? null,
        level: info?.level ?? null,
      });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      logger.error(`UID checker error: ${(e as Error).message}`);
      throw new HttpError(502, 'UID checker service is unavailable.');
    }
  }),
);

export default router;
