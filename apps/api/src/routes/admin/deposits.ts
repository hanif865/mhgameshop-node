import { Router } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { paginated, parsePagination } from '../../utils/response';

const router = Router();

const STATUSES = ['pending', 'paid', 'failed'];

// GET /api/admin/deposits?status=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const status = String(req.query.status ?? '');
    const where = STATUSES.includes(status) ? { status: status as any } : {};

    const [items, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { user: true },
      }),
      prisma.deposit.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

export default router;
