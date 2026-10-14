import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { gs } from '../utils/settings';
import { placeLikeOrder } from '../providers/like';

/**
 * Free Fire auto-like SUBSCRIPTION (মাসিক/সাপ্তাহিক প্যাকেজ)।
 *
 * কাস্টমার একবার প্যাকেজ কেনে (৭/১৫/৩০ দিন) → সাথে সাথে দিন-১ এর লাইক যায় →
 * এরপর প্রতিদিন একটা ফিক্সড সময়ে (ডিফল্ট রাত ৪টা BD, setting `like_sub_hour`)
 * অটোমেটিক লাইক যায়, যতদিন প্যাকেজ চলে।
 *
 * প্যাকেজ আলাদা প্রোডাক্ট-টাইপ নয় — এটা একটা `autolike` প্রোডাক্টের ভ্যারিয়েশন
 * যার `providerProductId` "<likes>x<days>" ফরম্যাটে (যেমন 100x30 = ১০০ লাইক/দিন,
 * ৩০ দিন; 200x7 = ২০০ লাইক/দিন, ৭ দিন)। নইলে ভ্যারিয়েশনটা আগের মতো one-shot।
 *
 * টেবিল schema.prisma এর বাইরে (raw SQL, saved_accounts এর মতো) — তাই নতুন
 * prisma migrate/generate ছাড়াই বুটে অটো-তৈরি হয়।
 *
 * ব্যর্থ দিন: provider নিজেই কলে ৩বার রিট্রাই করে; তাও না হলে ঐদিন স্কিপ হয়
 * (মেয়াদ বাড়ে না) — দিনটা গোনা হয় (days_sent++), শুধু success_count বাড়ে না।
 */

const BD_OFFSET_MS = 6 * 60 * 60 * 1000; // Bangladesh = UTC+6

export interface LikeSubPackage {
  likesPerDay: number; // 100 | 200
  totalDays: number; // > 0
}

/**
 * ভ্যারিয়েশনের providerProductId থেকে সাবস্ক্রিপশন প্যাকেজ পড়ি।
 * "100x30" / "200 x 7" / "100*15" / "200×30" / "100X15" / "200x30d" →
 * {likesPerDay, totalDays}; না মিললে null (মানে এটা সাবস্ক্রিপশন নয়, সাধারণ
 * one-shot auto-like)। সেপারেটর: x / X / × / * ; শেষে ঐচ্ছিক d/day/days/দিন।
 */
export function parseLikeSubPackage(providerProductId?: string | null): LikeSubPackage | null {
  const m = String(providerProductId ?? '')
    .trim()
    .match(/^(\d{2,4})\s*[x×*]\s*(\d{1,3})\s*(?:d|days?|দিন)?$/i);
  if (!m) return null;
  const likesPerDay = Number(m[1]) >= 200 ? 200 : 100;
  const totalDays = Math.max(1, Math.min(366, Number(m[2])));
  return { likesPerDay, totalDays };
}

/** ডেইলি ডেলিভারির সময় (BD ঘণ্টা, 0–23)। setting `like_sub_hour`, ডিফল্ট 4 (রাত ৪টা)। */
async function likeSubHour(): Promise<number> {
  try {
    const s = await gs();
    const h = Number(s.str('like_sub_hour'));
    if (Number.isInteger(h) && h >= 0 && h <= 23) return h;
  } catch {
    /* ignore — ডিফল্ট ব্যবহার করব */
  }
  return 4;
}

/**
 * `from` এর পরে BD ঘড়ির `hourBd:00` এর পরবর্তী ঘটনাটি UTC-তে ফেরত দেয়।
 * (BD = UTC+6; BD ওয়াল-ক্লক বানাতে from-এ ৬ঘণ্টা যোগ করে UTC getters ব্যবহার করি।)
 */
function nextRunAt(from: Date, hourBd: number): Date {
  const bd = new Date(from.getTime() + BD_OFFSET_MS);
  const target = new Date(bd);
  target.setUTCHours(hourBd, 0, 0, 0);
  if (target.getTime() <= bd.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - BD_OFFSET_MS);
}

/** যেকোনো গেটওয়েতে কাজ করে এমন synthetic order (placeLikeOrder শুধু এই ফিল্ডগুলো পড়ে)।
 *  200 হলে 'maxlike' → সব প্রোভাইডারই (ffbaazar/pinbot/ucbot) 200 বোঝে। */
function likeArg(id: unknown, playerId: string, likesPerDay: number) {
  return {
    id,
    accountInfo: { player_id: playerId },
    variation: { providerProductId: likesPerDay >= 200 ? 'maxlike' : 'like' },
  };
}

/** like_subscriptions টেবিল না থাকলে বানায় (বুট-টাইমে, idempotent)। */
export async function ensureLikeSubscriptionsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS like_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      variation_id INTEGER REFERENCES variations(id) ON DELETE SET NULL,
      player_id TEXT NOT NULL,
      nickname TEXT,
      gateway TEXT,
      likes_per_day INTEGER NOT NULL,
      total_days INTEGER NOT NULL,
      days_sent INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      next_run_at TIMESTAMP NOT NULL,
      last_run_at TIMESTAMP,
      last_result TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS like_subscriptions_due_idx ON like_subscriptions (status, next_run_at)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS like_subscriptions_user_idx ON like_subscriptions (user_id)`,
  );
}

export interface StartResult {
  ok: boolean; // day-1 এ লাইক গেছে কিনা
  nickname: string;
}

/**
 * অর্ডার থেকে সাবস্ক্রিপশন চালু করি: day-1 এর লাইক এখনই পাঠাই।
 * - placeLikeOrder throw করলে (misconfig/transient) সেটা bubble হয় → worker
 *   রিট্রাই করে, শেষে অর্ডার refund (runAutoLike/worker এর মতোই)।
 * - day-1 এ 0 লাইক (ভুল UID ইত্যাদি) → ok:false, কোনো row বসাই না; কলার
 *   অর্ডার cancel+refund করবে।
 * - সফল হলে row বসাই (days_sent=1) ও পরের দিনের সময় শিডিউল করি।
 */
export async function startLikeSubscription(
  order: any,
  pkg: LikeSubPackage,
): Promise<StartResult> {
  const playerId = String(order.accountInfo?.player_id ?? '').trim();
  if (!playerId) throw new Error('Player UID missing for like subscription.');

  const result = await placeLikeOrder(likeArg(order.id, playerId, pkg.likesPerDay));
  if (result.likesGiven <= 0) {
    return { ok: false, nickname: result.nickname };
  }

  const s = await gs();
  const gateway = (s.str('like_gateway') || 'amartopupbd').trim().toLowerCase();
  const hour = await likeSubHour();
  const next = nextRunAt(new Date(), hour);
  const status = pkg.totalDays <= 1 ? 'completed' : 'active';

  await prisma.$executeRaw`
    INSERT INTO like_subscriptions
      (user_id, order_id, product_id, variation_id, player_id, nickname, gateway,
       likes_per_day, total_days, days_sent, success_count, status,
       next_run_at, last_run_at, last_result)
    VALUES
      (${order.userId}, ${order.id}, ${order.productId ?? null}, ${order.variationId ?? null},
       ${playerId}, ${result.nickname || null}, ${gateway},
       ${pkg.likesPerDay}, ${pkg.totalDays}, 1, 1, ${status},
       ${next}, ${new Date()}, ${`ok: ${result.likesGiven} likes (day 1)`})`;

  logger.info(
    `🗓️ LikeSub created (order ${order.id}): ${pkg.likesPerDay}x${pkg.totalDays}, next ${next.toISOString()}`,
  );
  return { ok: true, nickname: result.nickname };
}

interface DueRow {
  id: number;
  player_id: string;
  likes_per_day: number;
  total_days: number;
  days_sent: number;
}

/**
 * Scheduler টিক — due (next_run_at <= now, active) সাবস্ক্রিপশনগুলোর আজকের লাইক
 * পাঠাই। worker প্রসেস প্রতি ~১০ মিনিটে ডাকে।
 *
 * ডাবল-সেন্ড ঠেকাতে আগে atomic "claim" করি (days_sent++, next_run_at কাল, দরকারে
 * completed) — শুধু তখনই ডেলিভার করি যদি আমরা সত্যিই claim পেয়ে থাকি। এতে দিনটা
 * ডেলিভারির আগেই গোনা হয়ে যায়, তাই ব্যর্থ হলে ঐদিন স্কিপ (মেয়াদ বাড়ে না)।
 */
export async function runDueLikeSubscriptions(): Promise<void> {
  const hour = await likeSubHour();
  const due = await prisma.$queryRaw<DueRow[]>`
    SELECT id, player_id, likes_per_day, total_days, days_sent
      FROM like_subscriptions
     WHERE status = 'active' AND next_run_at <= now()
     ORDER BY next_run_at ASC
     LIMIT 100`;
  if (!due.length) return;

  const next = nextRunAt(new Date(), hour);
  for (const sub of due) {
    // claim — কেবল এখনো active ও due থাকলেই।
    const claimed = await prisma.$executeRaw`
      UPDATE like_subscriptions
         SET days_sent = days_sent + 1,
             next_run_at = ${next},
             status = CASE WHEN days_sent + 1 >= total_days THEN 'completed' ELSE 'active' END,
             last_run_at = now(),
             updated_at = now()
       WHERE id = ${sub.id} AND status = 'active' AND next_run_at <= now()`;
    if (!claimed) continue; // অন্য টিক নিয়ে নিয়েছে

    try {
      const r = await placeLikeOrder(likeArg(`sub#${sub.id}`, sub.player_id, sub.likes_per_day));
      if (r.likesGiven > 0) {
        await prisma.$executeRaw`
          UPDATE like_subscriptions
             SET success_count = success_count + 1,
                 nickname = COALESCE(${r.nickname || null}, nickname),
                 last_result = ${`ok: ${r.likesGiven} likes`},
                 updated_at = now()
           WHERE id = ${sub.id}`;
        logger.info(`✅ LikeSub ${sub.id}: ${r.likesGiven} likes → ${r.nickname}`);
      } else {
        await prisma.$executeRaw`
          UPDATE like_subscriptions SET last_result = ${'skip: 0 likes'}, updated_at = now()
           WHERE id = ${sub.id}`;
        logger.warn(`⚠️ LikeSub ${sub.id}: 0 likes — day skipped`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      await prisma.$executeRaw`
        UPDATE like_subscriptions SET last_result = ${`error: ${msg}`}, updated_at = now()
         WHERE id = ${sub.id}`;
      logger.error(`❌ LikeSub ${sub.id} delivery error — day skipped: ${msg}`);
    }
  }
}

export interface LikeSubRow {
  id: number;
  user_id: number;
  user_name: string | null;
  player_id: string;
  nickname: string | null;
  gateway: string | null;
  likes_per_day: number;
  total_days: number;
  days_sent: number;
  success_count: number;
  status: string;
  next_run_at: Date;
  last_run_at: Date | null;
  last_result: string | null;
  created_at: Date;
}

/** Admin list — status filter সহ পেজিনেটেড। */
export async function listLikeSubscriptions(opts: {
  status?: string;
  skip: number;
  take: number;
}): Promise<{ items: LikeSubRow[]; total: number }> {
  const status = opts.status && ['active', 'completed', 'cancelled'].includes(opts.status)
    ? opts.status
    : null;

  const items = status
    ? await prisma.$queryRaw<LikeSubRow[]>`
        SELECT ls.*, u.name AS user_name
          FROM like_subscriptions ls
          LEFT JOIN users u ON u.id = ls.user_id
         WHERE ls.status = ${status}
         ORDER BY ls.id DESC
         LIMIT ${opts.take} OFFSET ${opts.skip}`
    : await prisma.$queryRaw<LikeSubRow[]>`
        SELECT ls.*, u.name AS user_name
          FROM like_subscriptions ls
          LEFT JOIN users u ON u.id = ls.user_id
         ORDER BY ls.id DESC
         LIMIT ${opts.take} OFFSET ${opts.skip}`;

  const countRows = status
    ? await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM like_subscriptions WHERE status = ${status}`
    : await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM like_subscriptions`;

  return { items, total: Number(countRows[0]?.n ?? 0) };
}

/** একটি সাবস্ক্রিপশন বাতিল (active হলেই)। userId দিলে মালিকানা যাচাই করে। */
export async function cancelLikeSubscription(id: number, userId?: number): Promise<boolean> {
  const affected = userId
    ? await prisma.$executeRaw`
        UPDATE like_subscriptions SET status = 'cancelled', updated_at = now()
         WHERE id = ${id} AND user_id = ${userId} AND status = 'active'`
    : await prisma.$executeRaw`
        UPDATE like_subscriptions SET status = 'cancelled', updated_at = now()
         WHERE id = ${id} AND status = 'active'`;
  return !!affected;
}
