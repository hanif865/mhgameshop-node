import { prisma } from '../config/database';
import { gs } from '../utils/settings';
import { logger } from '../utils/logger';
import { notifyUser } from './notification.service';

/**
 * রেফার সিস্টেম।
 *
 * প্রত্যেক ইউজারের একটা `referral_code` থাকে। নতুন কেউ সেই কোড দিয়ে
 * রেজিস্টার করলে `referred_by` বসে। এরপর সে প্রথম অর্ডার সম্পন্ন করলে
 * রেফারার বোনাস পান — একবারই (referral_rewards.referee_id ইউনিক)।
 *
 * টাকার অঙ্ক সেটিংস থেকে আসে, তাই কোড না বদলে অ্যাডমিন ঠিক করতে পারেন:
 *   referral_enabled, referral_bonus, referral_referee_bonus, referral_min_order
 *
 * কলাম/টেবিল raw SQL (schema.prisma এর বাইরে), তাই $queryRaw।
 */

/** এই ইউজারের রেফার কোড; না থাকলে বানিয়ে দেয়। */
export async function ensureReferralCode(userId: number): Promise<string> {
  const [row] = await prisma.$queryRaw<{ referral_code: string | null }[]>`
    SELECT referral_code FROM users WHERE id = ${userId}`;
  if (row?.referral_code) return row.referral_code;

  // সংঘর্ষ হলে আবার চেষ্টা — ইউনিক ইনডেক্সই শেষ রক্ষা
  for (let i = 0; i < 5; i++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    try {
      await prisma.$executeRaw`UPDATE users SET referral_code = ${code} WHERE id = ${userId}`;
      return code;
    } catch {
      /* আবার */
    }
  }
  throw new Error('রেফার কোড বানানো গেল না।');
}

/**
 * রেজিস্ট্রেশনের সময় রেফারার বসায়। ভুল কোড হলে চুপচাপ বাদ — রেজিস্ট্রেশন
 * যেন এতে আটকে না যায়।
 */
export async function attachReferrer(newUserId: number, code?: string | null): Promise<void> {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return;
  try {
    const s = await gs();
    if (!s.bool('referral_enabled')) return;

    const [ref] = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM users WHERE referral_code = ${c} LIMIT 1`;
    if (!ref || ref.id === newUserId) return; // নিজেকে রেফার করা যাবে না

    await prisma.$executeRaw`
      UPDATE users SET referred_by = ${ref.id} WHERE id = ${newUserId} AND referred_by IS NULL`;
    logger.info(`🎁 Referral: user ${newUserId} referred by ${ref.id} (${c})`);

    // নতুন ইউজারের সাইন-আপ বোনাস (সেট করা থাকলে)
    const refereeBonus = Number(s.str('referral_referee_bonus') || 0);
    if (refereeBonus > 0) {
      await creditBonus(newUserId, refereeBonus, `রেফার সাইন-আপ বোনাস (কোড ${c})`);
    }
  } catch (e) {
    logger.error(`Referral attach failed: ${(e as Error).message}`);
  }
}

/**
 * রেজিস্ট্রেশনের পরেও কোড বসানো (বট বা ওয়েবসাইট থেকে)।
 * অপব্যবহার ঠেকাতে দুটো শর্ত:
 *   • আগে কারো রেফারে আসেনি
 *   • এখনো কোনো অর্ডার সম্পন্ন করেনি (নইলে পুরনো ক্রেতাও দাবি করত)
 * ব্যর্থ হলে কারণসহ Error ছোড়ে, যাতে ইউজারকে বলা যায়।
 */
export async function applyReferralCode(userId: number, code: string): Promise<{ referrer: string; bonus: number }> {
  const s = await gs();
  if (!s.bool('referral_enabled')) throw new Error('রেফার প্রোগ্রাম এখন বন্ধ আছে।');

  const c = String(code ?? '').trim().toUpperCase();
  if (!c) throw new Error('কোড দিন।');

  const [me] = await prisma.$queryRaw<{ referred_by: number | null; referral_code: string | null }[]>`
    SELECT referred_by, referral_code FROM users WHERE id = ${userId}`;
  if (!me) throw new Error('ইউজার পাওয়া যায়নি।');
  if (me.referred_by) throw new Error('আপনি আগেই একজনের রেফারে এসেছেন।');
  if (me.referral_code === c) throw new Error('নিজের কোড নিজে ব্যবহার করা যাবে না।');

  const done = await prisma.order.count({ where: { userId, status: 'completed' } });
  if (done > 0) throw new Error('প্রথম অর্ডারের আগেই কোড দিতে হয়।');

  const [ref] = await prisma.$queryRaw<{ id: number; name: string }[]>`
    SELECT id, name FROM users WHERE referral_code = ${c} LIMIT 1`;
  if (!ref) throw new Error('এই কোডে কাউকে পাওয়া যায়নি।');
  if (ref.id === userId) throw new Error('নিজের কোড নিজে ব্যবহার করা যাবে না।');

  await prisma.$executeRaw`
    UPDATE users SET referred_by = ${ref.id} WHERE id = ${userId} AND referred_by IS NULL`;

  const refereeBonus = Number(s.str('referral_referee_bonus') || 0);
  if (refereeBonus > 0) await creditBonus(userId, refereeBonus, `রেফার বোনাস (কোড ${c})`);

  logger.info(`🎁 Referral applied: user ${userId} ← ${ref.id} (${c})`);
  return { referrer: ref.name, bonus: refereeBonus };
}

/** ব্যালান্স বাড়িয়ে একটা ট্রানজেকশন লিখে রাখে। */
async function creditBonus(userId: number, amount: number, remarks: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { balance: { increment: amount } } }),
    prisma.transaction.create({
      data: {
        userId,
        amount,
        trxType: 'credit',
        paymentMethod: 'referral',
        transactionId: 'REF' + Date.now() + Math.floor(Math.random() * 1000),
        remarks,
      },
    }),
  ]);
}

/**
 * অর্ডার সম্পন্ন হলে ডাকা হয়। যে অর্ডার করেছে সে যদি কারো রেফারে এসে
 * থাকে এবং এটাই তার প্রথম সম্পন্ন অর্ডার হয়, রেফারার বোনাস পান।
 * একাধিকবার ডাকা হলেও একবারই দেয় (referee_id ইউনিক)।
 */
export async function maybeRewardReferral(orderId: number): Promise<void> {
  try {
    const s = await gs();
    if (!s.bool('referral_enabled')) return;
    const bonus = Number(s.str('referral_bonus') || 0);
    if (bonus <= 0) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, amount: true },
    });
    if (!order || order.status !== 'completed') return;

    const minOrder = Number(s.str('referral_min_order') || 0);
    if (minOrder > 0 && Number(order.amount) < minOrder) return;

    const [u] = await prisma.$queryRaw<{ referred_by: number | null }[]>`
      SELECT referred_by FROM users WHERE id = ${order.userId}`;
    if (!u?.referred_by) return;

    // আগে বোনাস দেওয়া হয়েছে কিনা
    const [already] = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM referral_rewards WHERE referee_id = ${order.userId} LIMIT 1`;
    if (already) return;

    // রেকর্ড আগে বসাই — একসাথে দুটো অর্ডার এলেও ইউনিক কি দুবার দিতে দেবে না
    try {
      await prisma.$executeRaw`
        INSERT INTO referral_rewards (referrer_id, referee_id, order_id, amount)
        VALUES (${u.referred_by}, ${order.userId}, ${order.id}, ${bonus})`;
    } catch {
      return; // অন্য কেউ আগেই বসিয়েছে
    }

    await creditBonus(u.referred_by, bonus, `রেফার বোনাস — অর্ডার #${order.id}`);
    logger.info(`🎁 Referral bonus ৳${bonus} → user ${u.referred_by} (referee ${order.userId})`);
    notifyUser(
      u.referred_by,
      `🎁 <b>রেফার বোনাস!</b>

আপনার রেফারে আসা একজন প্রথম অর্ডার করেছেন।
💰 <b>৳${bonus}</b> আপনার ব্যালান্সে যোগ হয়েছে।`,
    ).catch(() => {});
  } catch (e) {
    logger.error(`Referral reward failed: ${(e as Error).message}`);
  }
}

/** এই ইউজারের রেফার তথ্য — কোড, কতজন এসেছে, কত আয়। */
export async function referralStats(userId: number) {
  const code = await ensureReferralCode(userId);

  // এই ইউজার নিজে কারো রেফারে এসেছে কিনা, আর এখনো কোড দিতে পারবে কিনা
  const [me] = await prisma.$queryRaw<{ referred_by: number | null; referrer_name: string | null }[]>`
    SELECT u.referred_by, r.name AS referrer_name
      FROM users u LEFT JOIN users r ON r.id = u.referred_by
     WHERE u.id = ${userId}`;
  const completedOrders = await prisma.order.count({ where: { userId, status: 'completed' } });
  const canApply = !me?.referred_by && completedOrders === 0;

  const [counts] = await prisma.$queryRaw<{ invited: bigint; rewarded: bigint; earned: string | null }[]>`
    SELECT
      (SELECT COUNT(*) FROM users WHERE referred_by = ${userId})::bigint AS invited,
      (SELECT COUNT(*) FROM referral_rewards WHERE referrer_id = ${userId})::bigint AS rewarded,
      (SELECT COALESCE(SUM(amount), 0) FROM referral_rewards WHERE referrer_id = ${userId}) AS earned`;
  const s = await gs();
  return {
    code,
    enabled: s.bool('referral_enabled'),
    bonus: Number(s.str('referral_bonus') || 0),
    refereeBonus: Number(s.str('referral_referee_bonus') || 0),
    minOrder: Number(s.str('referral_min_order') || 0),
    invited: Number(counts?.invited ?? 0),
    rewarded: Number(counts?.rewarded ?? 0),
    earned: Number(counts?.earned ?? 0),
    referredBy: me?.referrer_name ?? null, // কার রেফারে এসেছি
    canApply, // এখনো কোড দেওয়া যাবে?
  };
}
