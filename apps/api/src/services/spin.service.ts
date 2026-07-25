import { prisma } from '../config/database';
import { gs } from '../utils/settings';
import { logger } from '../utils/logger';
import { notifyUser } from './notification.service';

/**
 * Spin & Win — নতুন ইউজার একবার স্পিন করে একটা বোনাস (৳) পায়, যা সরাসরি
 * ওয়ালেট ব্যালান্সে যোগ হয়। রেফার বোনাসের মতোই ব্যালান্স + ট্রানজেকশন লেখে।
 *
 * অ্যাডমিন সেটিংস (কোড না বদলে নিয়ন্ত্রণ):
 *   spin_enabled  — চালু/বন্ধ (toggle)
 *   spin_prizes   — হুইলের অঙ্কগুলো, কমা দিয়ে। যেমন "1,2,3,5,7,10"
 *
 * একবার-প্রতি-ইউজার: spin_rewards.user_id ইউনিক — দুবার স্পিন আটকায়।
 * টেবিল schema.prisma এর বাইরে, তাই raw SQL।
 */

/** সেটিংস থেকে পুরস্কারের তালিকা; ফাঁকা/ভুল হলে ডিফল্ট ১–১০। */
function prizeList(raw: string): number[] {
  const arr = String(raw || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return arr.length ? arr : [1, 2, 3, 4, 5, 10];
}

/** এই ইউজারের স্পিন অবস্থা — চালু?, পুরস্কারগুলো, স্পিন করতে পারবে? */
export async function spinStatus(userId: number) {
  const s = await gs();
  const prizes = prizeList(s.str('spin_prizes'));
  const [won] = await prisma.$queryRaw<{ amount: string }[]>`
    SELECT amount FROM spin_rewards WHERE user_id = ${userId} LIMIT 1`;
  return {
    enabled: s.bool('spin_enabled'),
    prizes,
    canSpin: !won,
    wonAmount: won ? Number(won.amount) : null,
  };
}

/**
 * স্পিন করে বোনাস দেয়। রেকর্ড আগে বসায় (ইউনিক কি) যাতে একসাথে দুটো রিকোয়েস্ট
 * এলেও একবারই পায়। তারপর ব্যালান্স বাড়িয়ে ট্রানজেকশন লেখে।
 * ব্যর্থ হলে কারণসহ Error ছোড়ে।
 */
export async function doSpin(
  userId: number,
): Promise<{ amount: number; index: number; prizes: number[] }> {
  const s = await gs();
  if (!s.bool('spin_enabled')) throw new Error('স্পিন এখন বন্ধ আছে।');
  const prizes = prizeList(s.str('spin_prizes'));

  const [already] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM spin_rewards WHERE user_id = ${userId} LIMIT 1`;
  if (already) throw new Error('আপনি আগেই স্পিন করেছেন।');

  const index = Math.floor(Math.random() * prizes.length);
  const amount = prizes[index];

  // রেকর্ড আগে — ইউনিক কি দ্বিতীয় স্পিন ঠেকাবে
  try {
    await prisma.$executeRaw`
      INSERT INTO spin_rewards (user_id, amount) VALUES (${userId}, ${amount})`;
  } catch {
    throw new Error('আপনি আগেই স্পিন করেছেন।');
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { balance: { increment: amount } } }),
    prisma.transaction.create({
      data: {
        userId,
        amount,
        trxType: 'credit',
        paymentMethod: 'spin',
        transactionId: 'SPIN' + Date.now() + Math.floor(Math.random() * 1000),
        remarks: `স্পিন হুইল বোনাস ৳${amount}`,
      },
    }),
  ]);

  logger.info(`🎡 Spin: user ${userId} won ৳${amount}`);
  notifyUser(
    userId,
    `🎡 <b>স্পিন বোনাস!</b>

💰 <b>৳${amount}</b> আপনার ব্যালান্সে যোগ হয়েছে।`,
  ).catch(() => {});

  return { amount, index, prizes };
}

/** টেবিল না থাকলে বানায় — বুট-টাইমে একবার ডাকা হয় (idempotent)। */
export async function ensureSpinTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS spin_rewards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(16,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT now()
    )`);
}
