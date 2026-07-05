import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { ok, created } from '../../utils/response';

const router = Router();

const schema = z.object({
  title: z.string().min(1).max(255),
  icon: z.string().max(1024).nullable().optional(),
  orderColumn: z.coerce.number().int().default(0),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.category.findMany({
      orderBy: [{ orderColumn: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return ok(res, items);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const item = await prisma.category.create({ data });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const item = await prisma.category.update({ where: { id: Number(req.params.id) }, data });
    return ok(res, item, 'Category updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.category.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Category deleted.');
  }),
);

export default router;
