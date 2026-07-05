import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { ok, created } from '../../utils/response';

const router = Router();

const schema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  content: z.string().default(''),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.page.findMany({ orderBy: { id: 'desc' } });
    return ok(res, items);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const item = await prisma.page.create({ data });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const item = await prisma.page.update({ where: { id: Number(req.params.id) }, data });
    return ok(res, item, 'Page updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.page.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Page deleted.');
  }),
);

export default router;
