import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { LikeResult } from './autolike.provider';

/**
 * UcBot Like provider — Free Fire like via fflikes.ucbot.net.
 * Same `LikeResult` surface as autolike.provider / pinbotlike.provider so all
 * three are interchangeable through providers/like.ts.
 *
 * See like-api-doc.md (Base: https://fflikes.ucbot.net). GET only, api_key in
 * the query string. Two one-shot endpoints:
 *   GET /like?api_key=..&uid=..      → 100 likes (1 limit unit)
 *   GET /like200?api_key=..&uid=..   → up to 200 likes (1–2 units)
 * Optional server_name (default BD) — we leave it to the API default.
 *
 * Success (200): { success:true, data:{ status, PlayerNickname,
 *   LikesbeforeCommand, LikesafterCommand, LikesGivenByAPI, server_name, ... } }
 *   data.status 1 = likes given (counts toward limit);
 *   data.status 2 = no likes given (does NOT count) → cancel+refund.
 * Errors by HTTP code:
 *   429 (DAILY_LIMIT) / 400 (bad params/UID) → business fail: 0 likes, refund
 *     now (retrying is pointless — bad UID won't change, limit resets 04:00 BD).
 *   401 (no key) / 403 (invalid-deactivated key or UID blocked) → throw: let the
 *     worker retry+refund and surface the misconfig in the logs.
 *   500 / 503 (server / upstream / no group) → throw: transient, worker retries.
 */

async function conf() {
  const s = await gs();
  // key/URL পেস্টে ভুলে স্পেস এলে API auth-fail দিত — তাই trim করি।
  const apiKey = (s.str('ucbot_like_api_key') || env.UCBOT_LIKE_API_KEY || '').trim();
  const baseUrl = (
    s.str('ucbot_like_base_url') ||
    env.UCBOT_LIKE_BASE_URL ||
    'https://fflikes.ucbot.net'
  )
    .trim()
    .replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

/** GET with a per-attempt timeout and a short backoff (mirrors pinbotlike). */
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
 * কত লাইক চাই সেটা প্রোডাক্টের providerProductId থেকে: "200"/"max"/"maxlike" →
 * /like200, নইলে /like (100)।
 */
function endpointFor(order: any): string {
  const pp = String(order.variation?.providerProductId ?? '').trim().toLowerCase();
  return /200|max/.test(pp) ? '/like200' : '/like';
}

export async function placeLikeOrder(order: any): Promise<LikeResult> {
  const { apiKey, baseUrl } = await conf();
  if (!apiKey) {
    logger.error(
      `❌ UcBot Like: API key নেই (setting 'ucbot_like_api_key' / env UCBOT_LIKE_API_KEY) — order ${order.id}`,
    );
    throw new Error('UcBot Like API key is not configured.');
  }

  const uid = String(order.accountInfo?.player_id ?? '').trim();
  if (!uid) {
    logger.error(`❌ UcBot Like: player_id নেই (order ${order.id})`);
    throw new Error('Player UID missing for like order.');
  }

  const endpoint = endpointFor(order);
  // NB: never log the full URL — it carries the API key.
  const url = `${baseUrl}${endpoint}?api_key=${encodeURIComponent(apiKey)}&uid=${encodeURIComponent(uid)}`;
  logger.info(`📤 UcBot Like ${endpoint} order ${order.id} (uid: ${uid})`);

  const res = await getWithRetry(url);
  const body = (await res.json().catch(() => ({}))) as any;

  // key URL এ থাকে, body তে নয় — তাই raw লগ করা নিরাপদ ও rule যাচাইয়ে দরকারি।
  logger.info(`📥 UcBot Like response order ${order.id}: ${JSON.stringify(body)}`);

  // ভুল/নিষ্ক্রিয় key বা UID blocked / key না দেওয়া — রিট্রাই করে শেষে refund হোক,
  // লগে দেখা যাক।
  if (res.status === 401 || res.status === 403) {
    throw new Error(`UcBot Like auth failed (status ${res.status}): ${JSON.stringify(body)}`);
  }

  // ডেইলি লিমিট (429) বা বাজে প্যারাম/UID (400) — রিট্রাই অর্থহীন (লিমিট ০৪:০০ BD
  // তে রিসেট, ভুল UID বদলাবে না)। 0 লাইক ফেরত দিই → order.service cancel+refund।
  if (res.status === 429 || res.status === 400) {
    return { ok: false, likesGiven: 0, nickname: '', region: '', before: '', after: '', raw: body };
  }

  const data = (body?.data ?? {}) as any;
  const status = Number(data?.status);

  // সফল কল: status 1 = লাইক দেওয়া হয়েছে, 2 = কোনো লাইক দেয়নি (লিমিটে গোনা হয় না)।
  // দুটোই ব্যবসায়িক ফলাফল — order.service সিদ্ধান্ত নেবে: likes>0 → complete,
  // নইলে cancel+refund।
  if (body?.success === true && (status === 1 || status === 2)) {
    return {
      ok: status === 1,
      likesGiven: Number(data?.LikesGivenByAPI ?? 0) || 0,
      nickname: String(data?.PlayerNickname ?? '').trim(),
      region: String(data?.server_name ?? '').trim(),
      before: String(data?.LikesbeforeCommand ?? '').trim(),
      after: String(data?.LikesafterCommand ?? '').trim(),
      raw: body,
    };
  }

  // 500/503 বা অচেনা রেসপন্স (transport hiccup / HTML error / খালি বডি) — throw,
  // worker রিট্রাই করবে, শেষে refund।
  throw new Error(
    `UcBot Like unexpected response (status ${res.status}): ${JSON.stringify(body)}`,
  );
}
