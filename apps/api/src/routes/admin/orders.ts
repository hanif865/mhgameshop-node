import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@mhgs/database';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok, paginated, parsePagination } from '../../utils/response';

const router = Router();

const STATUSES = ['pending', 'processing', 'autoprocessing', 'completed', 'cancelled', 'hold'];

// GET /api/admin/orders?status=&search=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const status = String(req.query.status ?? '');
    const search = String(req.query.search ?? '').trim();

    const and: Prisma.OrderWhereInput[] = [];
    if (STATUSES.includes(status)) and.push({ status: status as any });
    if (search) {
      and.push({
        OR: [
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { accountInfo: { path: ['player_id'], string_contains: search } },
          ...(Number.isInteger(Number(search)) ? [{ id: Number(search) }] : []),
        ],
      });
    }
    const where: Prisma.OrderWhereInput = and.length ? { AND: and } : {};

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { user: true, product: true, variation: true, comboPackage: true },
      }),
      prisma.order.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

// GET /api/admin/orders/:id — full order detail
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        user: true,
        product: true,
        variation: true,
        comboPackage: true,
        comboOrderItems: {
          orderBy: { itemIndex: 'asc' },
          include: { comboPackageItem: true, comboVoucher: true },
        },
      },
    });
    if (!order) throw new HttpError(404, 'Order not found.');
    return ok(res, order);
  }),
);

// PUT /api/admin/orders/:id — update status / voucher_code / delivery_message
const updateSchema = z.object({
  status: z.enum(['pending', 'processing', 'autoprocessing', 'completed', 'cancelled', 'hold']).optional(),
  voucherCode: z.string().nullable().optional(),
  deliveryMessage: z.string().nullable().optional(),
});

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const item = await prisma.order.update({ where: { id: Number(req.params.id) }, data });
    return ok(res, item, 'Order updated.');
  }),
);

// GET /api/admin/orders/:id/combo-items — sub-items for combo orders
router.get(
  '/:id/combo-items',
  asyncHandler(async (req, res) => {
    const items = await prisma.comboOrderItem.findMany({
      where: { orderId: Number(req.params.id) },
      orderBy: { itemIndex: 'asc' },
      include: { comboPackageItem: true, comboVoucher: true },
    });
    return ok(res, items);
  }),
);

export default router;
