import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * AutoLike provider — Free Fire like/maxlike (ffbaazar.shop personal API).
 *
 * Two synchronous GET endpoints (see like-api-doc.md):
 *   GET {base}/like?key={key}&uid={playerId}
 *   GET {base}/maxlike?key={key}&uid={playerId}
 *
 * Response JSON of interest:
 *   LikesGivenByAPI, LikesbeforeCommand, LikesafterCommand,
 *   PlayerNickname, Region, UID
 *
 * Unlike TopupNet/PinBot this is fully synchronous — no callback webhook.
 * `placeLikeOrder` returns a normalized result; the order service decides
 * completion vs refund. It throws only when it could not even get a valid
 * answer (missing key / unresolved player / transport error) so the BullMQ
 * worker retries and finally refunds.
 */

export interface LikeResult {
  ok: boolean;
  likesGiven: number;
  nickname: string;
  region: string;
  before: string;
  after: string;
  raw: any;
}

async function conf() {
  const s = await gs();
  const apiKey = s.str('like_api_key') || env.LIKE_API_KEY || '';
  const baseUrl = (
    s.str('like_api_base_url') ||
    env.LIKE_API_BASE_URL ||
    'https://ffbaazar.shop'
  ).replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

/** GET with a per-attempt timeout and a short backoff (mirrors uid-checker). */
async function getWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

/**
 * Send likes for one order. `providerProductId === 'maxlike'` → /maxlike,
 * otherwise (empty included) → /like.
 */
export async function placeLikeOrder(order: any): Promise<LikeResult> {
  const { apiKey, baseUrl } = await conf();
  if (!apiKey) {
    logger.error(
      `❌ AutoLike: API key configured নেই (setting 'like_api_key' / env LIKE_API_KEY) — order ${order.id}`,
    );
    throw new Error('Like API key is not configured.');
  }

  const uid = String(order.accountInfo?.player_id ?? '').trim();
  if (!uid) {
    logger.error(`❌ AutoLike: player_id নেই (order ${order.id})`);
    throw new Error('Player UID missing for like order.');
  }

  const mode: 'like' | 'maxlike' =
    String(order.variation?.providerProductId ?? '').trim().toLowerCase() === 'maxlike'
      ? 'maxlike'
      : 'like';
  const endpoint = mode === 'maxlike' ? '/maxlike' : '/like';

  // NB: never log the full URL — it carries the personal API key.
  const url = `${baseUrl}${endpoint}?key=${encodeURIComponent(apiKey)}&uid=${encodeURIComponent(uid)}`;
  logger.info(`📤 AutoLike ${mode} order ${order.id} (uid: ${uid})`);

  const res = await getWithRetry(url);
  const data = (await res.json().catch(() => ({}))) as any;

  // রিয়েল response দেখে rule যাচাই করার জন্য raw সবসময় লগ করি (key URL এ, data তে নয়)।
  logger.info(`📥 AutoLike response order ${order.id}: ${JSON.stringify(data)}`);

  const nickname = String(data?.PlayerNickname ?? '').trim();
  const echoedUid = String(data?.UID ?? '').trim();
  const resolved = res.ok && (nickname !== '' || echoedUid !== '');

  if (!resolved) {
    // ভুল key / ভুল UID / সার্ভার সমস্যা — throw করলে worker রিট্রাই করে, শেষে refund।
    throw new Error(
      `AutoLike API did not resolve player (status ${res.status}): ${JSON.stringify(data)}`,
    );
  }

  const likesGiven = Number(data?.LikesGivenByAPI ?? 0) || 0;

  return {
    ok: true,
    likesGiven,
    nickname,
    region: String(data?.Region ?? '').trim(),
    before: String(data?.LikesbeforeCommand ?? '').trim(),
    after: String(data?.LikesafterCommand ?? '').trim(),
    raw: data,
  };
}
