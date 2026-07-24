import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { asyncHandler, HttpError } from '../middleware/error';
import { ok, fail } from '../utils/response';
import { syncPackStock, syncPacksForUc, detectUc, extractCodes, type PackRef } from '../services/pool.service';

/**
 * /api/bot/admin/* — admin actions issued from Telegram.
 *
 * Already behind requireBotKey (mounted inside routes/bot.ts); on top of that
 * the acting telegram_id must be linked to a user with role = 'admin'.
 */
const router = Router();

router.use(
  asyncHandler(async (req, res, next) => {
    const tid = String((req.query.telegram_id ?? req.body?.telegram_id) || '');
    if (!tid) return fail(res, 'telegram_id is required.', 422);
    const user = await prisma.user.findUnique({ where: { telegramId: tid } });
    if (!user || user.role !== 'admin') return fail(res, 'Admin access required.', 403);
    next();
  }),
);

// ---------------------------------------------------------------------------
// অ্যাডমিন পরিচয় ও ভূমিকা
// ---------------------------------------------------------------------------

/** কলার অ্যাডমিন কিনা — এখানে পৌঁছানো মানেই হ্যাঁ (উপরের গার্ড পাস করেছে)। */
router.get(
  '/whoami',
  asyncHandler(async (req, res) => {
    const tid = String(req.query.telegram_id ?? '');
    const u = await prisma.user.findUnique({
      where: { telegramId: tid },
      select: { id: true, name: true, email: true, role: true },
    });
    return ok(res, u);
  }),
);

router.get(
  '/admins',
  asyncHandler(async (_req, res) => {
    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, email: true, telegramId: true },
    });
    return ok(res, admins);
  }),
);

router.post(
  '/role',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        user: z.string().min(1), // email / telegram id / user id
        role: z.enum(['admin', 'user']),
      })
      .parse(req.body);

    const target = await prisma.user.findFirst({
      where: {
        OR: [
          { email: b.user.toLowerCase() },
          { telegramId: b.user },
          ...(Number.isInteger(Number(b.user)) ? [{ id: Number(b.user) }] : []),
        ],
      },
    });
    if (!target) throw new HttpError(404, 'User not found.');

    // নিজের অ্যাডমিন ক্ষমতা নিজে সরানো যাবে না — লক-আউট ঠেকাতে
    if (b.role === 'user' && target.telegramId === b.telegram_id) {
      throw new HttpError(422, 'নিজের অ্যাডমিন ক্ষমতা নিজে সরানো যাবে না।');
    }

    const u = await prisma.user.update({
      where: { id: target.id },
      data: { role: b.role },
      select: { id: true, name: true, email: true, role: true, telegramId: true },
    });
    return ok(res, u, 'Role updated.');
  }),
);

// ---------------------------------------------------------------------------
// UC ভাউচার পুল
// ---------------------------------------------------------------------------
router.get(
  '/stock',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.$queryRaw<{ uc: number; n: bigint }[]>`
      SELECT uc, COUNT(*)::bigint AS n FROM voucher_pool WHERE status='available' GROUP BY uc ORDER BY uc`;
    const [tot] = await prisma.$queryRaw<{ sold: bigint; invalid: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE status='sold')::bigint AS sold,
             COUNT(*) FILTER (WHERE status='invalid')::bigint AS invalid
        FROM voucher_pool`;
    return ok(res, {
      pool: rows.map((r) => ({ uc: r.uc, count: Number(r.n) })),
      sold: Number(tot?.sold ?? 0),
      invalid: Number(tot?.invalid ?? 0),
    });
  }),
);

const addStockSchema = z.object({
  telegram_id: z.string(),
  // uc দিলে সেটা fallback — যে কোডে সিরিয়াল থেকে UC বোঝা যায় না তাদের জন্য।
  // null/undefined দুটোই চলবে (nullish), নইলে null → 0 হয়ে যাচাই ফেল করত।
  uc: z.coerce.number().int().positive().nullish(),
  codes: z.array(z.string().min(8)).min(1).max(500),
});

router.post(
  '/stock',
  asyncHandler(async (req, res) => {
    const b = addStockSchema.parse(req.body);
    let added = 0;
    let duplicate = 0;
    const skipped: string[] = [];
    const byUc: Record<number, number> = {}; // কোন UC তে কয়টা ঢুকল
    const touched = new Set<number>();

    // পুরো লেখা একসাথে দেখি — এক লাইনে একাধিক কোড দিলেও আলাদা হয়ে যাবে
    const codes = extractCodes(b.codes.join('\n'));
    // যে লাইনে একটাও কোড পাওয়া গেল না, সেটা জানিয়ে দিই
    for (const raw of b.codes) {
      const line = raw.trim();
      if (line && extractCodes(line).length === 0) skipped.push(line.slice(0, 30));
    }

    for (const code of codes) {
      // সিরিয়াল থেকে UC শনাক্ত; না পারলে অ্যাডমিনের দেওয়া fallback
      const uc = detectUc(code) ?? b.uc ?? null;
      if (uc === null) {
        skipped.push(`${code.slice(0, 20)} (UC অজানা)`);
        continue;
      }
      const n = await prisma.$executeRaw`
        INSERT INTO voucher_pool (uc, code, status, note)
        VALUES (${uc}, ${code}, 'available', 'Telegram থেকে যোগ (auto-UC)')
        ON CONFLICT (code) DO NOTHING`;
      if (n > 0) {
        added++;
        byUc[uc] = (byUc[uc] || 0) + 1;
        touched.add(uc);
      } else {
        duplicate++;
      }
    }
    // যেসব UC তে কোড ঢুকল সেই প্যাকেজগুলোর স্টক মেলাই
    for (const uc of touched) await syncPacksForUc(uc);
    return ok(res, { added, duplicate, skipped, byUc }, 'Stock updated.');
  }),
);

// ---------------------------------------------------------------------------
// রেসিপি — কোন প্যাকেজে কোন UC কতটা
// ---------------------------------------------------------------------------
router.get(
  '/recipes',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.$queryRaw<
      { variation_id: number | null; combo_package_id: number | null; uc: number; qty: number; vtitle: string; ptitle: string }[]
    >`
      SELECT r.variation_id, r.combo_package_id, r.uc, r.qty,
             COALESCE(v.title, c.title) AS vtitle,
             COALESCE(pv.title, pc.title) AS ptitle
        FROM pack_recipes r
        LEFT JOIN variations v ON v.id = r.variation_id
        LEFT JOIN products pv ON pv.id = v.product_id
        LEFT JOIN combo_packages c ON c.id = r.combo_package_id
        LEFT JOIN products pc ON pc.id = c.product_id
       ORDER BY r.variation_id NULLS LAST, r.combo_package_id NULLS LAST, r.uc DESC`;
    return ok(res, rows);
  }),
);

const recipeSchema = z
  .object({
    telegram_id: z.string(),
    variation_id: z.coerce.number().int().positive().optional(),
    combo_package_id: z.coerce.number().int().positive().optional(),
    items: z.array(z.object({ uc: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1) })).max(10),
  })
  .refine((b) => !!b.variation_id !== !!b.combo_package_id, {
    message: 'Pass exactly one of variation_id / combo_package_id.',
  });

router.post(
  '/recipes',
  asyncHandler(async (req, res) => {
    const b = recipeSchema.parse(req.body);
    const ref: PackRef = b.combo_package_id ? { comboId: b.combo_package_id } : { variationId: b.variation_id! };

    if (ref.comboId) {
      const combo = await prisma.comboPackage.findUnique({ where: { id: ref.comboId } });
      if (!combo) throw new HttpError(404, 'Combo package not found.');
      await prisma.$executeRaw`DELETE FROM pack_recipes WHERE combo_package_id = ${ref.comboId}`;
      for (const it of b.items) {
        await prisma.$executeRaw`
          INSERT INTO pack_recipes (combo_package_id, uc, qty) VALUES (${ref.comboId}, ${it.uc}, ${it.qty})`;
      }
    } else {
      const variation = await prisma.variation.findUnique({ where: { id: ref.variationId! } });
      if (!variation) throw new HttpError(404, 'Variation not found.');
      await prisma.$executeRaw`DELETE FROM pack_recipes WHERE variation_id = ${ref.variationId!}`;
      for (const it of b.items) {
        await prisma.$executeRaw`
          INSERT INTO pack_recipes (variation_id, uc, qty) VALUES (${ref.variationId!}, ${it.uc}, ${it.qty})`;
      }
    }

    // রেসিপি বসানোর সাথে সাথেই স্টক পুল অনুযায়ী হয়ে যাবে
    const stock = await syncPackStock(ref);
    return ok(res, { ...ref, items: b.items, stock }, 'Recipe saved.');
  }),
);

// ---------------------------------------------------------------------------
// দাম ও স্টক (variation)
// ---------------------------------------------------------------------------
/** variation বা combo — যেটার আইডি এসেছে সেটাই আপডেট করি। */
const targetSchema = z
  .object({
    telegram_id: z.string(),
    variation_id: z.coerce.number().int().positive().optional(),
    combo_package_id: z.coerce.number().int().positive().optional(),
  })
  .refine((b) => !!b.variation_id !== !!b.combo_package_id, {
    message: 'Pass exactly one of variation_id / combo_package_id.',
  });

router.post(
  '/price',
  asyncHandler(async (req, res) => {
    const b = targetSchema.and(z.object({ price: z.coerce.number().min(0) })).parse(req.body);
    const sel = { id: true, title: true, price: true } as const;
    const v = b.combo_package_id
      ? await prisma.comboPackage.update({ where: { id: b.combo_package_id }, data: { price: b.price }, select: sel })
      : await prisma.variation.update({ where: { id: b.variation_id! }, data: { price: b.price }, select: sel });
    return ok(res, { ...v, price: Number(v.price) }, 'Price updated.');
  }),
);

router.post(
  '/variation-stock',
  asyncHandler(async (req, res) => {
    const b = targetSchema.and(z.object({ stock: z.coerce.number().int().min(0) })).parse(req.body);
    const sel = { id: true, title: true, stock: true } as const;
    const v = b.combo_package_id
      ? await prisma.comboPackage.update({ where: { id: b.combo_package_id }, data: { stock: b.stock }, select: sel })
      : await prisma.variation.update({ where: { id: b.variation_id! }, data: { stock: b.stock }, select: sel });
    return ok(res, v, 'Stock updated.');
  }),
);

// ---------------------------------------------------------------------------
// প্যাকেজ তৈরি ও সম্পাদনা (নাম, প্রোভাইডার কোড — শেল আইটেমের জন্য জরুরি)
// ---------------------------------------------------------------------------
router.post(
  '/pack',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        product_id: z.coerce.number().int().positive(),
        title: z.string().min(1),
        price: z.coerce.number().min(0),
        stock: z.coerce.number().int().min(0).default(0),
        provider_product_id: z.string().optional(),
      })
      .parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: b.product_id } });
    if (!product) throw new HttpError(404, 'Product not found.');

    const v = await prisma.variation.create({
      data: {
        productId: b.product_id,
        title: b.title,
        price: b.price,
        stock: b.stock,
        providerProductId: b.provider_product_id ?? '',
        // কোড দেওয়া থাকলে অটো-টপআপ চালু, নইলে হাতে করতে হবে
        automatic: !!b.provider_product_id,
      },
      select: { id: true, title: true, price: true, stock: true, providerProductId: true, automatic: true },
    });
    return ok(res, { ...v, price: Number(v.price) }, 'Pack created.');
  }),
);

router.post(
  '/pack-edit',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        variation_id: z.coerce.number().int().positive().optional(),
        combo_package_id: z.coerce.number().int().positive().optional(),
        title: z.string().min(1).optional(),
        provider_product_id: z.string().optional(),
        status: z.coerce.number().int().min(0).max(1).optional(),
      })
      .refine((x) => !!x.variation_id !== !!x.combo_package_id, {
        message: 'Pass exactly one of variation_id / combo_package_id.',
      })
      .parse(req.body);

    if (b.combo_package_id) {
      if (b.provider_product_id !== undefined) {
        throw new HttpError(422, 'কম্বো প্যাকেজে প্রোভাইডার কোড বসে না।');
      }
      const c = await prisma.comboPackage.update({
        where: { id: b.combo_package_id },
        data: { ...(b.title && { title: b.title }), ...(b.status !== undefined && { status: b.status }) },
        select: { id: true, title: true, status: true },
      });
      return ok(res, c, 'Pack updated.');
    }

    const v = await prisma.variation.update({
      where: { id: b.variation_id! },
      data: {
        ...(b.title && { title: b.title }),
        ...(b.status !== undefined && { status: b.status }),
        // কোড বসালে অটো চালু, খালি করলে বন্ধ
        ...(b.provider_product_id !== undefined && {
          providerProductId: b.provider_product_id,
          automatic: !!b.provider_product_id,
        }),
      },
      select: { id: true, title: true, status: true, providerProductId: true, automatic: true },
    });
    return ok(res, v, 'Pack updated.');
  }),
);

// ---------------------------------------------------------------------------
// শেল অ্যাকাউন্ট
// ---------------------------------------------------------------------------
router.get(
  '/shells',
  asyncHandler(async (_req, res) => {
    const shells = await prisma.shell.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, username: true, prefix: true, shellbalance: true, status: true, autocode: true },
    });
    return ok(
      res,
      shells.map((s) => ({ ...s, autocode: s.autocode ? '✓' : null })),
    );
  }),
);

router.post(
  '/shells',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        name: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        autocode: z.string().default(''),
        // shell | sgshell | myshell | indoshell — pinbot ছোট হাতের ছাড়া চেনে না
        prefix: z.string().min(1).transform((s) => s.trim().toLowerCase()),
        shellbalance: z.string().optional(),
      })
      .parse(req.body);
    const s = await prisma.shell.create({
      data: {
        name: b.name,
        username: b.username,
        password: b.password,
        autocode: b.autocode,
        prefix: b.prefix,
        shellbalance: b.shellbalance ?? null,
      },
      select: { id: true, name: true, username: true, prefix: true },
    });
    return ok(res, s, 'Shell added.');
  }),
);

router.patch(
  '/shells/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = z
      .object({
        telegram_id: z.string(),
        name: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        autocode: z.string().optional(),
        prefix: z.string().optional().transform((s) => (s === undefined ? s : s.trim().toLowerCase())),
        shellbalance: z.string().optional(),
        status: z.coerce.number().int().optional(),
      })
      .parse(req.body);
    const { telegram_id, ...data } = b;
    const s = await prisma.shell.update({
      where: { id },
      data,
      select: { id: true, name: true, username: true, prefix: true, shellbalance: true, status: true },
    });
    return ok(res, s, 'Shell updated.');
  }),
);

router.delete(
  '/shells/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const shell = await prisma.shell.findUnique({ where: { id } });
    if (!shell) throw new HttpError(404, 'Shell not found.');

    // এই শেলে বাঁধা প্রোডাক্ট থাকলে মোছা যাবে না — অর্ডার ভেঙে যেত
    const used = await prisma.product.count({ where: { shellId: id } });
    if (used > 0) {
      throw new HttpError(422, `এই শেলে ${used}টি প্রোডাক্ট বাঁধা আছে। আগে সেগুলো সরান বা শেলটা বন্ধ করুন।`);
    }

    await prisma.shell.delete({ where: { id } });
    return ok(res, { id, name: shell.name }, 'Shell deleted.');
  }),
);

// ---------------------------------------------------------------------------
// পার-ইউজার দাম (রিসেলার প্রাইসিং)
// ---------------------------------------------------------------------------

/** user শনাক্ত: email / telegram id / user id */
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
  '/user-prices',
  asyncHandler(async (req, res) => {
    const target = await findUser(String(req.query.user ?? ''));
    if (!target) throw new HttpError(404, 'User not found.');
    const rows = await prisma.$queryRaw<{ variation_id: number; price: unknown; title: string; ptitle: string }[]>`
      SELECT up.variation_id, up.price, v.title, p.title AS ptitle
        FROM user_prices up
        JOIN variations v ON v.id = up.variation_id
        JOIN products p ON p.id = v.product_id
       WHERE up.user_id = ${target.id}
       ORDER BY up.variation_id`;
    return ok(res, {
      user: { id: target.id, name: target.name, email: target.email },
      prices: rows.map((r) => ({ ...r, price: Number(r.price) })),
    });
  }),
);

// কাস্টম দাম বসাই/বদলাই
router.post(
  '/user-prices',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        user: z.string().min(1),
        variation_id: z.coerce.number().int().positive(),
        price: z.coerce.number().min(0),
      })
      .parse(req.body);
    const target = await findUser(b.user);
    if (!target) throw new HttpError(404, 'User not found.');
    const v = await prisma.variation.findUnique({ where: { id: b.variation_id }, select: { id: true, title: true } });
    if (!v) throw new HttpError(404, 'Variation not found.');

    await prisma.$executeRaw`
      INSERT INTO user_prices (user_id, variation_id, price)
      VALUES (${target.id}, ${b.variation_id}, ${b.price})
      ON CONFLICT (user_id, variation_id) DO UPDATE SET price = EXCLUDED.price`;

    return ok(res, {
      user: { id: target.id, name: target.name },
      variation: v,
      price: b.price,
    }, 'User price set.');
  }),
);

// কাস্টম দাম তুলে দিই (গ্লোবাল দামে ফিরে যায়)
router.delete(
  '/user-prices',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        user: z.string().min(1),
        variation_id: z.coerce.number().int().positive(),
      })
      .parse(req.body);
    const target = await findUser(b.user);
    if (!target) throw new HttpError(404, 'User not found.');
    await prisma.$executeRaw`
      DELETE FROM user_prices WHERE user_id = ${target.id} AND variation_id = ${b.variation_id}`;
    return ok(res, { user_id: target.id, variation_id: b.variation_id }, 'User price removed.');
  }),
);

// ---------------------------------------------------------------------------
// ইউজার ও ব্যালান্স
// ---------------------------------------------------------------------------
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { telegramId: q },
            ],
          }
        : undefined,
      orderBy: { id: 'desc' },
      take: 20,
      select: { id: true, name: true, email: true, balance: true, role: true, status: true, telegramId: true },
    });
    return ok(
      res,
      users.map((u) => ({ ...u, balance: Number(u.balance) })),
    );
  }),
);

router.post(
  '/balance',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        telegram_id: z.string(),
        user: z.string().min(1), // email বা telegram id বা user id
        amount: z.coerce.number(),
      })
      .parse(req.body);
    if (b.amount === 0) throw new HttpError(422, 'Amount cannot be zero.');

    const target = await prisma.user.findFirst({
      where: {
        OR: [
          { email: b.user.toLowerCase() },
          { telegramId: b.user },
          ...(Number.isInteger(Number(b.user)) ? [{ id: Number(b.user) }] : []),
        ],
      },
    });
    if (!target) throw new HttpError(404, 'User not found.');

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: target.id },
        data: { balance: { increment: b.amount } },
        select: { id: true, name: true, email: true, balance: true, telegramId: true },
      });
      await tx.transaction.create({
        data: {
          userId: target.id,
          amount: Math.abs(b.amount),
          trxType: b.amount > 0 ? 'credit' : 'debit',
          paymentMethod: 'telegram-admin',
          transactionId: 'TG' + Date.now(),
          remarks: 'Telegram থেকে অ্যাডমিন সমন্বয়',
        },
      });
      return u;
    });

    return ok(res, { ...updated, balance: Number(updated.balance) }, 'Balance updated.');
  }),
);

export default router;
