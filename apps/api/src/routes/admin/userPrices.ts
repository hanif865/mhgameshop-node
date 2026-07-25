import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok } from '../../utils/response';

/**
 * /api/admin/user-prices/* — পার-ইউজার দাম (রিসেলার প্রাইসিং), সেশন-অথ।
 */
const router = Router();

async function findUser(q: string) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { email: q.toLowerCase() },
        { telegramId: q },
        ...(Number.isInteger(Number(q)) ? [{ id: Number(q) }] : []),
      ],
    },
  });
}

// একজন ইউজারের সব কাস্টম দাম
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.user ?? '').trim();
    if (!q) throw new HttpError(422, 'user is required.');
    const target = await findUser(q);
    if (!target) throw new HttpError(404, 'User not found.');
    const rows = await prisma.$queryRaw<{ variation_id: number; price: unknown; title: string; ptitle: string }[]>`
      SELECT up.variation_id, up.price, v.title, p.title AS ptitle
        FROM user_prices up
        JOIN variations v ON v.id = up.variation_id
        JOIN products p ON p.id = v.product_id
       WHERE up.user_id = ${target.id}
       ORDER BY up.variation_id`;
    const [dr] = await prisma.$queryRaw<{ telegram_discount: unknown }[]>`
      SELECT telegram_discount FROM users WHERE id = ${target.id}`;
    return ok(res, {
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        telegram_discount: Number(dr?.telegram_discount ?? 0),
      },
      prices: rows.map((r) => ({ ...r, price: Number(r.price) })),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = z
      .object({ user: z.string().min(1), variation_id: z.coerce.number().int().positive(), price: z.coerce.number().min(0) })
      .parse(req.body);
    const target = await findUser(b.user);
    if (!target) throw new HttpError(404, 'User not found.');
    const v = await prisma.variation.findUnique({ where: { id: b.variation_id }, select: { id: true, title: true } });
    if (!v) throw new HttpError(404, 'Variation not found.');
    await prisma.$executeRaw`
      INSERT INTO user_prices (user_id, variation_id, price)
      VALUES (${target.id}, ${b.variation_id}, ${b.price})
      ON CONFLICT (user_id, variation_id) DO UPDATE SET price = EXCLUDED.price`;
    return ok(res, { user: { id: target.id, name: target.name }, variation: v, price: b.price }, 'User price set.');
  }),
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const b = z.object({ user: z.string().min(1), variation_id: z.coerce.number().int().positive() }).parse(req.body);
    const target = await findUser(b.user);
    if (!target) throw new HttpError(404, 'User not found.');
    await prisma.$executeRaw`DELETE FROM user_prices WHERE user_id = ${target.id} AND variation_id = ${b.variation_id}`;
    return ok(res, { ok: true }, 'User price removed.');
  }),
);

export default router;
