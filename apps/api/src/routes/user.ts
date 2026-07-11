import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/error';
import { ok, paginated, parsePagination } from '../utils/response';

const router = Router();
router.use(requireAuth);

function publicUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatar: u.avatar,
    balance: u.balance,
    role: u.role,
    createdAt: u.createdAt,
  };
}

// GET /api/user/profile
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(404, 'User not found.');
    return ok(res, publicUser(user));
  }),
);

// PUT /api/user/profile
const updateSchema = z.object({
  name: z.string().min(2).max(255),
  phone: z.string().max(20).nullable().optional(),
  avatar: z.string().max(1024).nullable().optional(),
  password: z.string().min(6).max(100).optional(),
});

router.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const data: Record<string, unknown> = {
      name: body.name,
      phone: body.phone ?? undefined,
      avatar: body.avatar ?? undefined,
    };
    if (body.password) data.password = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.update({ where: { id: req.userId! }, data });
    return ok(res, publicUser(user), 'Profile updated successfully.');
  }),
);

// GET /api/user/orders
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    // Hide orders that haven't been paid yet (pending gateway payment).
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

// GET /api/user/codes — voucher orders that are completed and have a code.
router.get(
  '/codes',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const where = {
      userId: req.userId!,
      status: 'completed' as const,
      voucherCode: { not: null },
      product: { type: 'voucher' as const },
    };
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { product: true, variation: true },
      }),
      prisma.order.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

// GET /api/user/transactions
router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const where = { userId: req.userId! };
    const [items, total] = await Promise.all([
      prisma.transaction.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
      prisma.transaction.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

export default router;
