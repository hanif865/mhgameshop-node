import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { ok, paginated, parsePagination } from '../../utils/response';

const router = Router();

function publicUser(u: any) {
  const { password, ...rest } = u;
  void password;
  return rest;
}

// GET /api/admin/users?search=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const search = String(req.query.search ?? '').trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { _count: { select: { orders: true } } },
      }),
      prisma.user.count({ where }),
    ]);
    return paginated(res, items.map(publicUser), { page, perPage, total });
  }),
);

// PUT /api/admin/users/:id — balance adjust / status / role / set password
const updateSchema = z.object({
  balance: z.coerce.number().nonnegative().optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
  role: z.enum(['user', 'admin', 'reseller']).optional(),
  telegram_discount: z.coerce.number().min(0).optional(),
  password: z.string().min(6).max(100).optional(),
});

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (parsed.balance !== undefined) data.balance = parsed.balance.toFixed(2);
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.role !== undefined) data.role = parsed.role;
    if (parsed.password) data.password = await bcrypt.hash(parsed.password, 10);

    const user = await prisma.user.update({ where: { id: Number(req.params.id) }, data });
    if (parsed.telegram_discount !== undefined) {
      await prisma.$executeRaw`UPDATE users SET telegram_discount = ${parsed.telegram_discount} WHERE id = ${Number(req.params.id)}`;
    }
    return ok(res, publicUser(user), 'User updated.');
  }),
);

export default router;
