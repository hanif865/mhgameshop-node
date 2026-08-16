import { Settings } from './settings';

/**
 * ইউনিফায়েড ৫-লেভেল স্কিম — লিডারবোর্ড (public.ts), প্রোফাইল (routes/user.ts)
 * ও checkout ছাড় (order.service.ts) সব এক জায়গা থেকে চালায়।
 *
 * min ৳ ও ছাড় % দুটোই admin settings-এ এডিটযোগ্য (`level_*_min` / `level_*_discount`)।
 * ⚠️ prod DB-তে এই key না থাকলে নিচের fallback-ই কার্যকর হয় — তাই fallback = আসল live config।
 * ছাড় fallback সব 0: deploy-এ কোনো money-impact নেই, admin ইচ্ছাকৃতভাবে % সেট করলে তবেই ছাড় বসে।
 * `s.int()` মান verbatim `Number(...)` ফেরত দেয়, তাই 2.5-এর মতো ভগ্নাংশ %-ও কাজ করে।
 */

export type LevelName = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'premium';

export interface LevelStep {
  index: number; // 1..5
  name: LevelName;
  min: number; // এই লেভেলে পৌঁছাতে ন্যূনতম lifetime খরচ
  discountPercent: number; // এই লেভেলের ছাড় %
}

/** ৫ ধাপ ascending (Bronze → Premium)। */
export function levelLadder(s: Settings): LevelStep[] {
  return [
    { index: 1, name: 'bronze', min: s.int('level_bronze_min', 2000), discountPercent: s.int('level_bronze_discount', 0) },
    { index: 2, name: 'silver', min: s.int('level_silver_min', 5000), discountPercent: s.int('level_silver_discount', 0) },
    { index: 3, name: 'gold', min: s.int('level_gold_min', 10000), discountPercent: s.int('level_gold_discount', 0) },
    { index: 4, name: 'platinum', min: s.int('level_platinum_min', 20000), discountPercent: s.int('level_platinum_discount', 0) },
    { index: 5, name: 'premium', min: s.int('level_premium_min', 50000), discountPercent: s.int('level_premium_discount', 0) },
  ];
}

export interface CurrentLevel {
  index: number; // 0 = কোনো লেভেল নেই (Bronze-এর নিচে)
  name: LevelName;
  min: number; // current লেভেলের min (none হলে 0)
  discountPercent: number;
  nextName: LevelName | null; // পরের লেভেল (max হলে null)
  nextMin: number | null; // পরের লেভেলের threshold (max হলে null)
  progressPercent: number; // 0..100 — পরের লেভেলের দিকে অগ্রগতি (max হলে 100)
}

/** মোট খরচ → বর্তমান লেভেল + পরের লেভেলের দিকে অগ্রগতি। */
export function levelFor(spent: number, s: Settings): CurrentLevel {
  const ladder = levelLadder(s);
  const spend = Math.max(0, Number(spent) || 0);

  // min ≤ spend এমন সর্বোচ্চ ধাপ (ascending, তাই শেষ ম্যাচটাই current)
  let current: LevelStep | null = null;
  for (const step of ladder) {
    if (spend >= step.min) current = step;
    else break;
  }

  // Bronze-এর নিচে — লেভেল নেই; অগ্রগতি প্রথম ধাপের দিকে
  if (!current) {
    const first = ladder[0];
    const progressPercent = first.min > 0 ? Math.min(100, (spend / first.min) * 100) : 0;
    return {
      index: 0,
      name: 'none',
      min: 0,
      discountPercent: 0,
      nextName: first.name,
      nextMin: first.min,
      progressPercent,
    };
  }

  const next = ladder.find((l) => l.index === current!.index + 1) ?? null;
  let progressPercent = 100; // max লেভেলে পূর্ণ
  if (next) {
    const span = next.min - current.min;
    progressPercent = span > 0 ? Math.min(100, Math.max(0, ((spend - current.min) / span) * 100)) : 100;
  }

  return {
    index: current.index,
    name: current.name,
    min: current.min,
    discountPercent: current.discountPercent,
    nextName: next ? next.name : null,
    nextMin: next ? next.min : null,
    progressPercent,
  };
}
