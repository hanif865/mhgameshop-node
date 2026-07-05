import { Router } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { paginated, parsePagination } from '../../utils/response';

const router = Router();

// GET /api/admin/transactions?type=credit|debit
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const type = String(req.query.type ?? '');
    const where = type === 'credit' || type === 'debit' ? { trxType: type as any } : {};

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { user: true },
      }),
      prisma.transaction.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

export default router;
