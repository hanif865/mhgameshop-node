import { prisma } from '../config/database';
import { gs } from '../utils/settings';
import { logger } from '../utils/logger';
import { notifyUser } from './notification.service';

/**
 * কনটেন্ট ক্রিয়েটর / মার্কেটার প্রোগ্রাম।
 *
 * ক্রিয়েটর ওয়েবসাইটের রিভিউ ভিডিওর লিঙ্ক জমা দেয় → অ্যাডমিন দেখে
 * অনুমোদন বা বাতিল করেন → অনুমোদনে অ্যাডমিনের ঠিক করা বোনাস ওয়ালেটে যায়।
 *
 * creator_submissions টেবিল raw SQL (schema.prisma এর বাইরে), তাই $queryRaw।
 */

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

/** লিঙ্ক দেখে কোন প্ল্যাটফর্ম আন্দাজ করি (ক্রিয়েটরকে বাছতে হয় না)। */
function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return 'youtube';
  if (/facebook\.com|fb\.watch/.test(u)) return 'facebook';
  if (/tiktok\.com/.test(u)) return 'tiktok';
  if (/instagram\.com/.test(u)) return 'instagram';
  return 'other';
}

/** ক্রিয়েটর নতুন ভিডিও জমা দেয়। ব্যর্থ হলে কারণসহ Error। */
export async function submitVideo(
  userId: number,
  input: { url: string; views?: number | null; note?: string | null },
): Promise<{ id: number; platform: string }> {
  const s = await gs();
  if (!s.bool('creator_enabled')) throw new Error('ক্রিয়েটর প্রোগ্রাম এখন বন্ধ আছে।');

  const url = String(input.url ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('সঠিক ভিডিও লিঙ্ক দিন (http বা https সহ)।');

  // একসাথে অনেক পেন্ডিং জমা ঠেকাই
  const [pending] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM creator_submissions
     WHERE user_id = ${userId} AND status = 'pending'`;
  if (Number(pending?.n ?? 0) >= 3) {
    throw new Error('আপনার ৩টি জমা এখনো অপেক্ষায় আছে। আগে সেগুলোর ফল আসুক।');
  }

  const platform = detectPlatform(url);
  try {
    const [row] = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO creator_submissions (user_id, platform, url, views, note)
      VALUES (${userId}, ${platform}, ${url}, ${input.views ?? null}, ${input.note ?? null})
      RETURNING id`;
    logger.info(`🎬 Creator submission #${row.id} by user ${userId} (${platform})`);
    return { id: row.id, platform };
  } catch (e) {
    // ইউনিক ইনডেক্স ভাঙল — একই লিঙ্ক আগেই জমা পড়েছে।
    // Postgres কোড 23505; Prisma raw query তে বার্তাটা নানা রকম হয়,
    // তাই কোড ও "already exists" দুটোই দেখি।
    const msg = (e as Error).message;
    if (/23505|duplicate key|already exists|unique/i.test(msg)) {
      throw new Error('এই ভিডিওটি আগেই জমা দেওয়া হয়েছে।');
    }
    logger.error(`Creator submit failed: ${msg}`);
    throw new Error('জমা দেওয়া গেল না, আবার চেষ্টা করুন।');
  }
}

/** এই ইউজারের জমা ও প্রোগ্রামের শর্ত। */
export async function mySubmissions(userId: number) {
  const s = await gs();
  const items = await prisma.$queryRaw<any[]>`
    SELECT id, platform, url, views, note, status, bonus, admin_note, created_at, reviewed_at
      FROM creator_submissions WHERE user_id = ${userId}
     ORDER BY id DESC LIMIT 50`;
  const [sum] = await prisma.$queryRaw<{ earned: string | null }[]>`
    SELECT COALESCE(SUM(bonus), 0) AS earned FROM creator_submissions
     WHERE user_id = ${userId} AND status = 'approved'`;
  return {
    enabled: s.bool('creator_enabled'),
    rules: s.str('creator_rules'),
    earned: Number(sum?.earned ?? 0),
    items: items.map((i) => ({ ...i, bonus: Number(i.bonus) })),
  };
}

/** অ্যাডমিন: জমার তালিকা (স্ট্যাটাস অনুযায়ী)। */
export async function listSubmissions(status?: string, limit = 100) {
  const st = ['pending', 'approved', 'rejected'].includes(String(status)) ? String(status) : null;
  const rows = st
    ? await prisma.$queryRaw<any[]>`
        SELECT c.*, u.name AS user_name, u.email AS user_email
          FROM creator_submissions c JOIN users u ON u.id = c.user_id
         WHERE c.status = ${st} ORDER BY c.id DESC LIMIT ${limit}`
    : await prisma.$queryRaw<any[]>`
        SELECT c.*, u.name AS user_name, u.email AS user_email
          FROM creator_submissions c JOIN users u ON u.id = c.user_id
         ORDER BY c.id DESC LIMIT ${limit}`;
  return rows.map((r) => ({ ...r, bonus: Number(r.bonus) }));
}

/**
 * অ্যাডমিন অনুমোদন বা বাতিল করেন।
 * অনুমোদনে বোনাস ওয়ালেটে যোগ হয় — অঙ্কটা অ্যাডমিনই ঠিক করেন।
 */
export async function reviewSubmission(
  adminId: number,
  id: number,
  action: 'approve' | 'reject',
  opts: { bonus?: number; note?: string | null },
): Promise<{ id: number; status: SubmissionStatus; bonus: number; userId: number }> {
  const [sub] = await prisma.$queryRaw<{ id: number; user_id: number; status: string }[]>`
    SELECT id, user_id, status FROM creator_submissions WHERE id = ${id}`;
  if (!sub) throw new Error('জমাটি পাওয়া যায়নি।');
  if (sub.status !== 'pending') throw new Error('এটি আগেই দেখা হয়েছে।');

  if (action === 'reject') {
    await prisma.$executeRaw`
      UPDATE creator_submissions
         SET status = 'rejected', admin_note = ${opts.note ?? null},
             reviewed_by = ${adminId}, reviewed_at = NOW()
       WHERE id = ${id} AND status = 'pending'`;
    logger.info(`🎬 Submission #${id} rejected`);
    notifyUser(
      sub.user_id,
      `❌ <b>ভিডিও জমা #${id} গ্রহণ করা হয়নি</b>` + (opts.note ? `

💬 ${opts.note}` : ''),
    ).catch(() => {});
    return { id, status: 'rejected', bonus: 0, userId: sub.user_id };
  }

  const bonus = Number(opts.bonus ?? 0);
  if (!(bonus > 0)) throw new Error('বোনাসের পরিমাণ দিন।');

  // status শর্তসহ আপডেট — দুজন অ্যাডমিন একসাথে চাপলেও একবারই পাস হবে
  const n = await prisma.$executeRaw`
    UPDATE creator_submissions
       SET status = 'approved', bonus = ${bonus}, admin_note = ${opts.note ?? null},
           reviewed_by = ${adminId}, reviewed_at = NOW()
     WHERE id = ${id} AND status = 'pending'`;
  if (n === 0) throw new Error('এটি আগেই দেখা হয়েছে।');

  await prisma.$transaction([
    prisma.user.update({ where: { id: sub.user_id }, data: { balance: { increment: bonus } } }),
    prisma.transaction.create({
      data: {
        userId: sub.user_id,
        amount: bonus,
        trxType: 'credit',
        paymentMethod: 'creator-bonus',
        transactionId: 'CRT' + Date.now() + Math.floor(Math.random() * 1000),
        remarks: `কনটেন্ট ক্রিয়েটর বোনাস — জমা #${id}`,
      },
    }),
  ]);

  logger.info(`🎬 Submission #${id} approved — ৳${bonus} → user ${sub.user_id}`);
  notifyUser(
    sub.user_id,
    `✅ <b>ভিডিও জমা #${id} অনুমোদিত!</b>

💰 <b>৳${bonus}</b> আপনার ব্যালান্সে যোগ হয়েছে।` +
      (opts.note ? `
💬 ${opts.note}` : ''),
  ).catch(() => {});
  return { id, status: 'approved', bonus, userId: sub.user_id };
}
