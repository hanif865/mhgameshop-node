import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { requireBotKey } from '../middleware/botAuth';
import { asyncHandler, HttpError } from '../middleware/error';
import { ok } from '../utils/response';
import { addOrder } from '../services/order.service';
import { referralStats, applyReferralCode } from '../services/referral.service';
import { submitVideo, mySubmissions } from '../services/creator.service';
import botAdminRoutes from './botAdmin';

/**
 * /api/bot/* — endpoints for the Telegram top-up bot.
 *
 * The bot is a thin client: the website stays the single source of truth for
 * users, wallet balance, stock and orders. Every call is authenticated with the
 * shared BOT_API_KEY; the acting customer is identified by `telegram_id`.
 */
const router = Router();
router.use(requireBotKey);

// অ্যাডমিন কাজ (স্টক, রেসিপি, দাম, শেল, ব্যালান্স) — ভেতরে আবার admin যাচাই হয়
router.use('/admin', botAdminRoutes);

/** Resolve the website user linked to this Telegram account. */
async function userByTelegram(telegramId: string) {
  if (!telegramId) throw new HttpError(422, 'telegram_id is required.');
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) throw new HttpError(404, 'This Telegram account is not linked to any website account yet.');
  if (user.status !== 1) throw new HttpError(403, 'Account is disabled.');
  return user;
}

const publicUser = (u: { id: number; name: string; email: string; balance: unknown }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  balance: Number(u.balance),
});

// ---------------------------------------------------------------------------
// POST /api/bot/link — link a Telegram account to a website account.
// The customer proves ownership with their website email + password.
// ---------------------------------------------------------------------------
const linkSchema = z.object({
  telegram_id: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/link',
  asyncHandler(async (req, res) => {
    const body = linkSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    if (!user?.password) throw new HttpError(401, 'Wrong email or password.');

    const passwordOk = await bcrypt.compare(body.password, user.password);
    if (!passwordOk) throw new HttpError(401, 'Wrong email or password.');
    if (user.status !== 1) throw new HttpError(403, 'Account is disabled.');

    const taken = await prisma.user.findUnique({ where: { telegramId: body.telegram_id } });
    if (taken && taken.id !== user.id) {
      throw new HttpError(409, 'This Telegram account is already linked to another user.');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { telegramId: body.telegram_id },
      select: { id: true, name: true, email: true, balance: true },
    });

    return ok(res, publicUser(updated), 'Linked successfully.');
  }),
);

// POST /api/bot/unlink
router.post(
  '/unlink',
  asyncHandler(async (req, res) => {
    const telegramId = String(req.body?.telegram_id ?? '');
    const user = await userByTelegram(telegramId);
    await prisma.user.update({ where: { id: user.id }, data: { telegramId: null } });
    return ok(res, null, 'Unlinked.');
  }),
);

// GET /api/bot/me?telegram_id=...
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await userByTelegram(String(req.query.telegram_id ?? ''));
    return ok(res, publicUser(user));
  }),
);

// GET /api/bot/referral?telegram_id=... — এই ইউজারের রেফার তথ্য
router.get(
  '/referral',
  asyncHandler(async (req, res) => {
    const user = await userByTelegram(String(req.query.telegram_id ?? ''));
    return ok(res, await referralStats(user.id));
  }),
);

// POST /api/bot/referral — কারো রেফার কোড বসানো
router.post(
  '/referral',
  asyncHandler(async (req, res) => {
    const b = z.object({ telegram_id: z.string(), code: z.string().min(1).max(32) }).parse(req.body);
    const user = await userByTelegram(b.telegram_id);
    try {
      return ok(res, await applyReferralCode(user.id, b.code), 'Referral applied.');
    } catch (e) {
      throw new HttpError(422, (e as Error).message);
    }
  }),
);

// GET /api/bot/creator?telegram_id=... — আমার জমা ও শর্ত
router.get(
  '/creator',
  asyncHandler(async (req, res) => {
    const user = await userByTelegram(String(req.query.telegram_id ?? ''));
    return ok(res, await mySubmissions(user.id));
  }),
);

// POST /api/bot/creator — ভিডিও জমা
router.post(
  '/creator',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        url: z.string().min(5).max(500),
        views: z.coerce.number().int().min(0).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(req.body);
    const user = await userByTelegram(b.telegram_id);
    try {
      return ok(res, await submitVideo(user.id, b), 'Submitted.');
    } catch (e) {
      throw new HttpError(422, (e as Error).message);
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/bot/products — active products + variations (prices, stock)
// ---------------------------------------------------------------------------
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      where: { status: 1 },
      orderBy: [{ orderColumn: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        type: true,
        formFields: true,
        variations: {
          where: { status: 1 },
          orderBy: [{ orderColumn: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, price: true, stock: true, automatic: true, providerProductId: true },
        },
        comboPackages: {
          where: { status: 1 },
          orderBy: [{ orderColumn: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, price: true, stock: true },
        },
      },
    });

    // telegram_id দিলে এই ইউজারের নিজস্ব দাম বসিয়ে দিই (রিসেলার প্রাইসিং)
    const tid = String(req.query.telegram_id ?? '');
    const overrides = new Map<number, number>();
    if (tid) {
      const u = await prisma.user.findUnique({ where: { telegramId: tid }, select: { id: true } });
      if (u) {
        const rows = await prisma.$queryRaw<{ variation_id: number; price: unknown }[]>`
          SELECT variation_id, price FROM user_prices WHERE user_id = ${u.id}`;
        for (const r of rows) overrides.set(r.variation_id, Number(r.price));
      }
    }

    return ok(
      res,
      products.map((p) => ({
        ...p,
        variations: p.variations.map((v) => ({
          ...v,
          price: overrides.has(v.id) ? overrides.get(v.id)! : Number(v.price),
          // কাস্টম দাম হলে বটে চিহ্ন দেখানো যায়
          customPrice: overrides.has(v.id),
        })),
        comboPackages: p.comboPackages.map((c) => ({ ...c, price: Number(c.price) })),
      })),
    );
  }),
);

// ---------------------------------------------------------------------------
// POST /api/bot/orders — place an order paid from the customer's wallet.
// Reuses the same addOrder() pipeline the website uses (stock, provider, queue).
// ---------------------------------------------------------------------------
const orderSchema = z.object({
  telegram_id: z.string().min(3),
  variation_id: z.string().min(1), // numeric id, or "combo-{id}"
  account_info: z.record(z.string()).nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(100).optional(),
});

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const body = orderSchema.parse(req.body);
    const user = await userByTelegram(body.telegram_id);

    const result = await addOrder({
      userId: user.id,
      variationId: body.variation_id,
      paymentMethod: 'wallet',
      accountInfo: body.account_info ?? null,
      quantity: body.quantity,
    });

    return res.status(201).json({ success: true, ...result });
  }),
);

// GET /api/bot/orders?telegram_id=...&limit=10 — customer's recent orders
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const user = await userByTelegram(String(req.query.telegram_id ?? ''));
    const take = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

    const orders = await prisma.order.findMany({
      where: { userId: user.id, status: { not: 'pending' } },
      orderBy: { id: 'desc' },
      take,
      include: { product: true, variation: true },
    });

    return ok(res, orders);
  }),
);

// GET /api/bot/orders/:id?telegram_id=...
router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const user = await userByTelegram(String(req.query.telegram_id ?? ''));
    const order = await prisma.order.findFirst({
      where: { id: Number(req.params.id), userId: user.id },
      include: { product: true, variation: true },
    });
    if (!order) throw new HttpError(404, 'Order not found.');
    return ok(res, order);
  }),
);

export default router;
