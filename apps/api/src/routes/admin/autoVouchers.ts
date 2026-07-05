import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { ok, created, paginated, parsePagination } from '../../utils/response';
import { parseCodeLines } from '../../utils/helpers';

const router = Router();

function statusFilter(query: Record<string, unknown>) {
  const f = String(query.filter ?? 'all');
  if (f === 'available') return { status: 'available' as const };
  if (f === 'sold') return { status: 'sold' as const };
  return {};
}

const schema = z.object({
  variationId: z.coerce.number().int(),
  code: z.string().min(1),
  status: z.enum(['available', 'sold']).default('available'),
});

// GET /api/admin/auto-vouchers?filter=all|available|sold&variationId=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const where = {
      ...statusFilter(req.query),
      ...(req.query.variationId ? { variationId: Number(req.query.variationId) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.autoVoucher.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { variation: { include: { product: true } } },
      }),
      prisma.autoVoucher.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const item = await prisma.autoVoucher.create({ data });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const item = await prisma.autoVoucher.update({ where: { id: Number(req.params.id) }, data });
    return ok(res, item, 'Auto voucher updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.autoVoucher.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Auto voucher deleted.');
  }),
);

// POST /api/admin/auto-vouchers/bulk
const bulkSchema = z.object({
  variationId: z.coerce.number().int(),
  codes: z.string(),
});

router.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const { variationId, codes } = bulkSchema.parse(req.body);
    const list = parseCodeLines(codes);
    if (list.length === 0) return ok(res, { added: 0 }, 'No codes provided.');
    const result = await prisma.autoVoucher.createMany({
      data: list.map((code) => ({ variationId, code, status: 'available' as const })),
    });
    return created(res, { added: result.count }, `${result.count} auto vouchers added.`);
  }),
);

export default router;
