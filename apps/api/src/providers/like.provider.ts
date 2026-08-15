import { gs } from '../utils/settings';
import { logger } from '../utils/logger';

/**
 * Free Fire Like সেল — amartopupbd.com এর API।
 *   like    : সাধারণ লাইক
 *   maxlike : ম্যাক্স লাইক
 * দুটোই GET, key + uid দিয়ে। রেসপন্সে status===1 হলে সফল, LikesGivenByAPI = কতগুলো গেল।
 * key সেটিংসে (like_api_key), URL কোডে ফিক্সড।
 */

const BASE = 'https://admin.amartopupbd.com';

export type LikeKind = 'like' | 'maxlike';

export interface LikeResult {
  ok: boolean;
  likes: number;
  nickname?: string;
  region?: string;
  message?: string;
  raw: any;
}

export async function sendLike(kind: LikeKind, uid: string): Promise<LikeResult> {
  const s = await gs();
  const key = (s.str('like_api_key') || '').trim();
  if (!key) return { ok: false, likes: 0, message: 'Like API key সেট করা নেই।', raw: null };
  if (!uid) return { ok: false, likes: 0, message: 'UID পাওয়া যায়নি।', raw: null };

  const url = `${BASE}/${kind}?key=${encodeURIComponent(key)}&uid=${encodeURIComponent(uid)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const raw = await res.json().catch(() => ({}));
    const likes = Number(raw?.LikesGivenByAPI ?? 0) || 0;
    const ok = Number(raw?.status) === 1 || likes > 0;
    logger.info(`👍 Like API (${kind}) uid ${uid}: status=${raw?.status} likes=${likes}`);
    return {
      ok,
      likes,
      nickname: raw?.PlayerNickname,
      region: raw?.Region,
      message: raw?.message ?? raw?.msg,
      raw,
    };
  } catch (e) {
    logger.error(`❌ Like API error (${kind}, uid ${uid}): ${(e as Error).message}`);
    return { ok: false, likes: 0, message: 'Like API সংযোগ ব্যর্থ।', raw: null };
  }
}
