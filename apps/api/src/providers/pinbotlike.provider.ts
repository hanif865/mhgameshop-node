import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { LikeResult } from './autolike.provider';

/**
 * PinBot Like provider — Free Fire like/maxlike via api.pinbot.shop.
 * Same `LikeResult` surface as autolike.provider (amartopupbd) so the two are
 * interchangeable through providers/like.ts.
 *
 * See like-api-doc.md (Base: http://api.pinbot.shop). Synchronous GET, credits
 * are decided by the TOKEN itself:
 *   100like_xxxx → always 100 likes (1 credit)   → GET /like
 *   200like_xxxx → always 200 likes (1 credit)   → GET /like
 *   like_xxxx    → flexible                       → GET /like=100 (1cr) | /like=200 (2cr)
 * Query params: playerid, api_key.
 *
 * Success (200): { status:1, PlayerNickname, LikesbeforeCommand,
 *                  LikesafterCommand, LikesGivenByAPI, _credits:{...} }
 * Business fail (200, status:0, note:no_limit_deducted) → API auto-refunded its
 *   own credit; we still return likesGiven:0 so the order is cancelled+refunded.
 * Daily limit (429, code:DAILY_LIMIT_EXHAUSTED) → same: 0 likes, refund now
 *   (retrying before midnight is pointless).
 * Auth error (401, code:AUTH_*) → throw: misconfig, let the worker retry+refund
 *   and surface it in the logs.
 */

async function conf() {
  const s = await gs();
  const apiKey = s.str('pinbot_like_api_key') || env.PINBOT_LIKE_API_KEY;
  const baseUrl = (
    s.str('pinbot_like_base_url') || env.PINBOT_LIKE_BASE_URL
  ).replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

/** GET with a per-attempt timeout and a short backoff (mirrors autolike). */
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
 * টোকেনের ধরন দেখে endpoint বাছি। 100like_/200like_ টোকেন নিজেই সংখ্যা ঠিক
 * করে (তাই শুধু /like), আর like_ ডিফল্ট টোকেনে আমরা /like=100 বা /like=200 বলি।
 * কত লাইক চাই সেটা প্রোডাক্টের providerProductId থেকে: "200"/"max"/"maxlike" → ২০০,
 * নইলে ১০০।
 */
function endpointFor(apiKey: string, order: any): string {
  if (apiKey.startsWith('100like_') || apiKey.startsWith('200like_')) return '/like';
  const pp = String(order.variation?.providerProductId ?? '').trim().toLowerCase();
  const want = /200|max/.test(pp) ? 200 : 100;
  return `/like=${want}`;
}

export async function placeLikeOrder(order: any): Promise<LikeResult> {
  const { apiKey, baseUrl } = await conf();
  if (!apiKey) {
    logger.error(
      `❌ PinBot Like: API key নেই (setting 'pinbot_like_api_key' / env PINBOT_LIKE_API_KEY) — order ${order.id}`,
    );
    throw new Error('PinBot Like API key is not configured.');
  }

  const uid = String(order.accountInfo?.player_id ?? '').trim();
  if (!uid) {
    logger.error(`❌ PinBot Like: player_id নেই (order ${order.id})`);
    throw new Error('Player UID missing for like order.');
  }

  const endpoint = endpointFor(apiKey, order);
  // NB: never log the full URL — it carries the API token.
  const url = `${baseUrl}${endpoint}?playerid=${encodeURIComponent(uid)}&api_key=${encodeURIComponent(apiKey)}`;
  logger.info(`📤 PinBot Like ${endpoint} order ${order.id} (uid: ${uid})`);

  const res = await getWithRetry(url);
  const data = (await res.json().catch(() => ({}))) as any;

  // key URL এ থাকে, data তে নয় — তাই raw লগ করা নিরাপদ ও rule যাচাইয়ে দরকারি।
  logger.info(`📥 PinBot Like response order ${order.id}: ${JSON.stringify(data)}`);

  const code = String(data?.code ?? '');
  // ভুল/মেয়াদোত্তীর্ণ টোকেন — রিট্রাই করে শেষে refund হোক, লগে দেখা যাক।
  if (res.status === 401 || /AUTH_REQUIRED|INVALID_TOKEN_TYPE|AUTH_FAILED/.test(code)) {
    throw new Error(`PinBot Like auth failed (status ${res.status}): ${JSON.stringify(data)}`);
  }

  const status = Number(data?.status);
  // status 1 = সফল, 0 = ব্যর্থ (ডেইলি লিমিট/আগেই ম্যাক্স ইত্যাদি)। দুটোই ব্যবসায়িক
  // ফলাফল — order.service সিদ্ধান্ত নেবে: likes>0 → complete, নইলে cancel+refund।
  if (status === 1 || status === 0) {
    return {
      ok: status === 1,
      likesGiven: Number(data?.LikesGivenByAPI ?? 0) || 0,
      nickname: String(data?.PlayerNickname ?? '').trim(),
      region: String(data?.Region ?? '').trim(),
      before: String(data?.LikesbeforeCommand ?? '').trim(),
      after: String(data?.LikesafterCommand ?? '').trim(),
      raw: data,
    };
  }

  // অচেনা রেসপন্স (transport hiccup / HTML error / খালি বডি) — throw, worker রিট্রাই করবে।
  throw new Error(
    `PinBot Like unexpected response (status ${res.status}): ${JSON.stringify(data)}`,
  );
}
