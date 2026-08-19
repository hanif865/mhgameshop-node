import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@mhgs/database';
import { prisma } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { orderLimiter } from '../middleware/rateLimiter';
import { asyncHandler, HttpError } from '../middleware/error';
import { ok, paginated, parsePagination } from '../utils/response';
import { addOrder } from '../services/order.service';

const router = Router();

const createSchema = z.object({
  variation_id: z.string().min(1),
  payment_method: z.enum(['wallet', 'uddoktapay']),
  account_info: z.record(z.string()).nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(100).optional(),
  idempotency_key: z.string().min(8).max(64),
  // Facebook Pixel কুকি — ব্রাউজার থেকে পাঠানো হয় (সার্ভার-সাইড CAPI ম্যাচ)।
  fbp: z.string().max(256).optional(),
  fbc: z.string().max(256).optional(),
});

// POST /api/orders
router.post(
  '/',
  requireAuth,
  orderLimiter,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    // 1. Idempotency — reject a replayed submission.
    try {
      await prisma.idempotencyKey.create({
        data: { userId: req.userId!, key: body.idempotency_key },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'Duplicate request — this order was already submitted.');
      }
      throw e;
    }

    const result = await addOrder({
      userId: req.userId!,
      variationId: body.variation_id,
      paymentMethod: body.payment_method,
      accountInfo: body.account_info ?? null,
      quantity: body.quantity,
      // Facebook CAPI ম্যাচ-সিগন্যাল — req থেকে তুলে রাখি (গেটওয়ে ফেরার পথে req
      // থাকে না, তাই এখানেই ধরে Redis-এ রাখা হয়)।
      tracking: {
        clientIp: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        fbp: body.fbp ?? req.cookies?._fbp ?? null,
        fbc: body.fbc ?? req.cookies?._fbc ?? null,
        eventSourceUrl: (req.headers['referer'] as string | undefined) ?? null,
      },
    });

    return res.status(201).json({ success: true, ...result });
  }),
);

// GET /api/orders — current user's orders (paginated)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    // Hide unpaid (pending) orders from the user's list.
    const where = { userId: req.userId!, status: { not: 'pending' as const } };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { product: true, variation: true, comboPackage: true },
      }),
      prisma.order.count({ where }),
    ]);

    return paginated(res, items, { page, perPage, total });
  }),
);

// GET /api/orders/:id — detail + combo sub-items
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const order = await prisma.order.findFirst({
      where: { id, userId: req.userId! },
      include: {
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

export default router;
