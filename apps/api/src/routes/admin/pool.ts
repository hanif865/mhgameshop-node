import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok } from '../../utils/response';
import { syncPackStock, syncPacksForUc, detectUc, extractCodes, type PackRef } from '../../services/pool.service';

/**
 * /api/admin/pool/* — UC ভাউচার পুল ও রেসিপি, ওয়েবসাইট অ্যাডমিন প্যানেল থেকে।
 * বটের /api/bot/admin/* এর মতোই কাজ, তবে সেশন-অথ (requireAdmin)।
 */
const router = Router();

// ---- পুল স্টক ----
router.get(
  '/stock',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.$queryRaw<{ uc: number; available: number; sold: number; invalid: number }[]>`
      SELECT uc,
             COUNT(*) FILTER (WHERE status='available')::int AS available,
             COUNT(*) FILTER (WHERE status='sold')::int      AS sold,
             COUNT(*) FILTER (WHERE status='invalid')::int   AS invalid
        FROM voucher_pool GROUP BY uc ORDER BY uc`;
    return ok(res, rows);
  }),
);

router.post(
  '/stock',
  asyncHandler(async (req, res) => {
    const b = z
      .object({ uc: z.coerce.number().int().positive().nullish(), codes: z.array(z.string().min(8)).min(1).max(1000) })
      .parse(req.body);
    let added = 0;
    let duplicate = 0;
    const skipped: string[] = [];
    const byUc: Record<number, number> = {};
    const touched = new Set<number>();

    // পুরো লেখা একসাথে — এক লাইনে একাধিক কোড দিলেও আলাদা হয়ে যাবে
    const codes = extractCodes(b.codes.join('\n'));
    for (const raw of b.codes) {
      const line = raw.trim();
      if (line && extractCodes(line).length === 0) skipped.push(line.slice(0, 30));
    }

    for (const code of codes) {
      const uc = detectUc(code) ?? b.uc ?? null;
      if (uc === null) {
        skipped.push(`${code.slice(0, 20)} (UC অজানা)`);
        continue;
      }
      const n = await prisma.$executeRaw`
        INSERT INTO voucher_pool (uc, code, status, note)
        VALUES (${uc}, ${code}, 'available', 'ওয়েব অ্যাডমিন থেকে যোগ')
        ON CONFLICT (code) DO NOTHING`;
      if (n > 0) {
        added++;
        byUc[uc] = (byUc[uc] || 0) + 1;
        touched.add(uc);
      } else duplicate++;
    }
    for (const uc of touched) await syncPacksForUc(uc);
    return ok(res, { added, duplicate, skipped, byUc }, 'Stock updated.');
  }),
);

/**
 * এক UC এর সব কোড — কোনটা কোন অর্ডারে গেল, কখন, অর্ডারের অবস্থা কী।
 * `stuck` = কোড খরচ দেখাচ্ছে অথচ অর্ডার ক্যান্সেল — অর্থাৎ ফেরত আসেনি।
 */
router.get(
  '/codes/:uc',
  asyncHandler(async (req, res) => {
    const uc = Number(req.params.uc);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT vp.id, vp.code, vp.status, vp.order_id, vp.note, vp.updated_at,
             o.status::text AS order_status,
             (vp.status = 'sold' AND o.status = 'cancelled') AS stuck
        FROM voucher_pool vp
        LEFT JOIN orders o ON o.id = vp.order_id
       WHERE vp.uc = ${uc}
       ORDER BY vp.updated_at DESC NULLS LAST, vp.id DESC
       LIMIT 500`;
    return ok(res, rows);
  }),
);

/** ক্যান্সেল হওয়া অর্ডারে আটকে থাকা কোড — ফেরত আসেনি, ব্যবহারও হচ্ছে না। */
router.get(
  '/stuck',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT vp.id, vp.uc, vp.code, vp.order_id, vp.updated_at, o.status::text AS order_status
        FROM voucher_pool vp
        JOIN orders o ON o.id = vp.order_id
       WHERE vp.status = 'sold' AND o.status = 'cancelled'
       ORDER BY vp.updated_at DESC`;
    return ok(res, rows);
  }),
);

/** আটকে থাকা কোড পুলে ফেরত (অ্যাডমিন নিশ্চিত হলে)। */
router.post(
  '/restore',
  asyncHandler(async (req, res) => {
    const b = z.object({ ids: z.array(z.coerce.number().int()).min(1).max(500) }).parse(req.body);
    const ucs = await prisma.$queryRaw<{ uc: number }[]>`
      SELECT DISTINCT uc FROM voucher_pool WHERE id = ANY(${b.ids}::int[])`;
    const n = await prisma.$executeRaw`
      UPDATE voucher_pool SET status = 'available', order_id = NULL, updated_at = NOW()
       WHERE id = ANY(${b.ids}::int[]) AND status = 'sold'`;
    for (const r of ucs) await syncPacksForUc(r.uc).catch(() => null);
    return ok(res, { restored: n }, 'Codes returned to stock.');
  }),
);

// সব ভ্যারিয়েশন ও কম্বো — রেসিপি/দাম ফর্মের সিলেক্টরের জন্য (পেজিনেশন ছাড়া)
router.get(
  '/packs',
  asyncHandler(async (_req, res) => {
    const [variations, combos] = await Promise.all([
      prisma.variation.findMany({
        where: { status: 1 },
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
        select: { id: true, title: true, price: true, product: { select: { title: true, type: true } } },
      }),
      prisma.comboPackage.findMany({
        where: { status: 1 },
        orderBy: [{ id: 'asc' }],
        select: { id: true, title: true, price: true, product: { select: { title: true } } },
      }),
    ]);
    return ok(res, {
      variations: variations.map((v) => ({
        id: v.id, title: v.title, price: Number(v.price),
        product: v.product?.title ?? '', type: v.product?.type ?? '',
      })),
      combos: combos.map((c) => ({ id: c.id, title: c.title, price: Number(c.price), product: c.product?.title ?? '' })),
    });
  }),
);

// ---- রেসিপি ----
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
      if (!(await prisma.comboPackage.findUnique({ where: { id: ref.comboId } }))) throw new HttpError(404, 'Combo not found.');
      await prisma.$executeRaw`DELETE FROM pack_recipes WHERE combo_package_id = ${ref.comboId}`;
      for (const it of b.items)
        await prisma.$executeRaw`INSERT INTO pack_recipes (combo_package_id, uc, qty) VALUES (${ref.comboId}, ${it.uc}, ${it.qty})`;
    } else {
      if (!(await prisma.variation.findUnique({ where: { id: ref.variationId! } }))) throw new HttpError(404, 'Variation not found.');
      await prisma.$executeRaw`DELETE FROM pack_recipes WHERE variation_id = ${ref.variationId!}`;
      for (const it of b.items)
        await prisma.$executeRaw`INSERT INTO pack_recipes (variation_id, uc, qty) VALUES (${ref.variationId!}, ${it.uc}, ${it.qty})`;
    }
    const stock = await syncPackStock(ref);
    return ok(res, { ...ref, items: b.items, stock }, 'Recipe saved.');
  }),
);

router.delete(
  '/recipes',
  asyncHandler(async (req, res) => {
    const b = z
      .object({ variation_id: z.coerce.number().int().positive().optional(), combo_package_id: z.coerce.number().int().positive().optional() })
      .refine((x) => !!x.variation_id !== !!x.combo_package_id)
      .parse(req.body);
    if (b.combo_package_id) await prisma.$executeRaw`DELETE FROM pack_recipes WHERE combo_package_id = ${b.combo_package_id}`;
    else await prisma.$executeRaw`DELETE FROM pack_recipes WHERE variation_id = ${b.variation_id!}`;
    return ok(res, { ok: true }, 'Recipe removed.');
  }),
);

export default router;
