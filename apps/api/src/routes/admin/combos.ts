import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok, created, paginated, parsePagination } from '../../utils/response';
import { parseCodeLines } from '../../utils/helpers';

const router = Router();

// ---------------------------------------------------------------------------
// Combo packages
// ---------------------------------------------------------------------------
const comboSchema = z.object({
  productId: z.coerce.number().int(),
  title: z.string().min(1).max(255),
  price: z.coerce.number().nonnegative().default(0),
  buyRate: z.coerce.number().nonnegative().default(0),
  stock: z.coerce.number().int().default(0),
  orderColumn: z.coerce.number().int().default(0),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

function money<T extends { price?: number; buyRate?: number }>(d: T) {
  return {
    ...d,
    ...(d.price !== undefined ? { price: d.price.toFixed(2) } : {}),
    ...(d.buyRate !== undefined ? { buyRate: d.buyRate.toFixed(2) } : {}),
  } as any;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const [items, total] = await Promise.all([
      prisma.comboPackage.findMany({
        orderBy: [{ orderColumn: 'asc' }, { id: 'desc' }],
        skip,
        take,
        include: { product: true, _count: { select: { items: true } } },
      }),
      prisma.comboPackage.count(),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.comboPackage.findUnique({
      where: { id: Number(req.params.id) },
      include: { product: true },
    });
    if (!item) throw new HttpError(404, 'Combo not found.');
    return ok(res, item);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const item = await prisma.comboPackage.create({ data: money(comboSchema.parse(req.body)) });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.comboPackage.update({
      where: { id: Number(req.params.id) },
      data: money(comboSchema.partial().parse(req.body)),
    });
    return ok(res, item, 'Combo updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.comboPackage.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Combo deleted.');
  }),
);

// ---------------------------------------------------------------------------
// Combo items (with per-item voucher counts)
// ---------------------------------------------------------------------------
router.get(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const comboPackageId = Number(req.params.id);
    const items = await prisma.comboPackageItem.findMany({
      where: { comboPackageId },
      orderBy: { orderColumn: 'asc' },
    });

    const counts = await prisma.comboPackageVoucher.groupBy({
      by: ['comboPackageItemId', 'status'],
      where: { comboPackageItemId: { in: items.map((i) => i.id) } },
      _count: { _all: true },
    });

    const withCounts = items.map((item) => {
      const avail = counts.find((c) => c.comboPackageItemId === item.id && c.status === 'available');
      const sold = counts.find((c) => c.comboPackageItemId === item.id && c.status === 'sold');
      return {
        ...item,
        availableCount: avail?._count._all ?? 0,
        soldCount: sold?._count._all ?? 0,
      };
    });
    return ok(res, withCounts);
  }),
);

const itemSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  orderColumn: z.coerce.number().int().default(0),
});

router.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const data = itemSchema.parse(req.body);
    const item = await prisma.comboPackageItem.create({
      data: { ...data, comboPackageId: Number(req.params.id) },
    });
    return created(res, item);
  }),
);

// ---- Voucher-specific routes (literal "vouchers") registered first ----
const voucherEditSchema = z.object({
  code: z.string().min(1).optional(),
  status: z.enum(['available', 'sold']).optional(),
});

router.put(
  '/:id/items/vouchers/:voucherId',
  asyncHandler(async (req, res) => {
    const item = await prisma.comboPackageVoucher.update({
      where: { id: Number(req.params.voucherId) },
      data: voucherEditSchema.parse(req.body),
    });
    return ok(res, item, 'Code updated.');
  }),
);

router.delete(
  '/:id/items/vouchers/:voucherId',
  asyncHandler(async (req, res) => {
    await prisma.comboPackageVoucher.delete({ where: { id: Number(req.params.voucherId) } });
    return ok(res, null, 'Code deleted.');
  }),
);

router.get(
  '/:id/items/:itemId/vouchers',
  asyncHandler(async (req, res) => {
    const items = await prisma.comboPackageVoucher.findMany({
      where: { comboPackageItemId: Number(req.params.itemId) },
      orderBy: { id: 'desc' },
    });
    return ok(res, items);
  }),
);

router.post(
  '/:id/items/:itemId/vouchers/bulk',
  asyncHandler(async (req, res) => {
    const comboPackageItemId = Number(req.params.itemId);
    const codes = parseCodeLines(String(req.body.codes ?? ''));
    if (codes.length === 0) return ok(res, { added: 0 }, 'No codes provided.');
    const result = await prisma.comboPackageVoucher.createMany({
      data: codes.map((code) => ({ comboPackageItemId, code, status: 'available' as const })),
    });
    return created(res, { added: result.count }, `${result.count} codes added.`);
  }),
);

// ---- Generic item update/delete (registered last) ----
router.put(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const item = await prisma.comboPackageItem.update({
      where: { id: Number(req.params.itemId) },
      data: itemSchema.partial().parse(req.body),
    });
    return ok(res, item, 'Item updated.');
  }),
);

router.delete(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    await prisma.comboPackageItem.delete({ where: { id: Number(req.params.itemId) } });
    return ok(res, null, 'Item deleted.');
  }),
);

export default router;
