import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok, created, paginated, parsePagination } from '../../utils/response';
import { parseCodeLines } from '../../utils/helpers';

const router = Router();

// Robust boolean: accepts true/false, 1/0, "1"/"0", "true"/"false", "on".
const zBool = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}, z.boolean());

const schema = z.object({
  productId: z.coerce.number().int(),
  title: z.string().min(1).max(255),
  price: z.coerce.number().nonnegative().default(0),
  buyRate: z.coerce.number().nonnegative().default(0),
  stock: z.coerce.number().int().default(0),
  provider: z.string().max(255).nullable().optional(),
  providerProductId: z.string().max(255).nullable().optional(),
  automatic: zBool.default(false),
  orderColumn: z.coerce.number().int().default(0),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

// GET /api/admin/variations — with product + voucher/auto-voucher counts.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    const where = productId ? { productId } : {};

    const [items, total] = await Promise.all([
      prisma.variation.findMany({
        where,
        orderBy: [{ productId: 'asc' }, { orderColumn: 'asc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          product: true,
          _count: { select: { vouchers: true, autoVouchers: true } },
        },
      }),
      prisma.variation.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.variation.findUnique({
      where: { id: Number(req.params.id) },
      include: { product: true, _count: { select: { vouchers: true, autoVouchers: true } } },
    });
    if (!item) throw new HttpError(404, 'Variation not found.');
    return ok(res, item);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = normalize(schema.parse(req.body));
    const item = await prisma.variation.create({ data });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = normalize(schema.partial().parse(req.body));
    const item = await prisma.variation.update({ where: { id: Number(req.params.id) }, data });
    return ok(res, item, 'Variation updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.variation.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Variation deleted.');
  }),
);

// GET /api/admin/variations/:id/auto-vouchers — list.
router.get(
  '/:id/auto-vouchers',
  asyncHandler(async (req, res) => {
    const items = await prisma.autoVoucher.findMany({
      where: { variationId: Number(req.params.id) },
      orderBy: { id: 'desc' },
    });
    return ok(res, items);
  }),
);

// POST /api/admin/variations/:id/auto-vouchers/bulk — line-by-line add.
router.post(
  '/:id/auto-vouchers/bulk',
  asyncHandler(async (req, res) => {
    const variationId = Number(req.params.id);
    const codes = parseCodeLines(String(req.body.codes ?? ''));
    if (codes.length === 0) return ok(res, { added: 0 }, 'No codes provided.');

    const result = await prisma.autoVoucher.createMany({
      data: codes.map((code) => ({ variationId, code, status: 'available' as const })),
    });
    return created(res, { added: result.count }, `${result.count} auto vouchers added.`);
  }),
);

// DELETE /api/admin/variations/auto-vouchers/:id — single delete.
router.delete(
  '/auto-vouchers/:id',
  asyncHandler(async (req, res) => {
    await prisma.autoVoucher.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Auto voucher deleted.');
  }),
);

function normalize<T extends { price?: number; buyRate?: number }>(data: T) {
  return {
    ...data,
    ...(data.price !== undefined ? { price: data.price.toFixed(2) } : {}),
    ...(data.buyRate !== undefined ? { buyRate: data.buyRate.toFixed(2) } : {}),
  } as any;
}

export default router;
