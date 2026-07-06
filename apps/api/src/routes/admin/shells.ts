import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { ok, created } from '../../utils/response';

const router = Router();

const schema = z.object({
  name: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
  autocode: z.string().min(1).max(255),
  prefix: z.string().max(255).nullable().optional(),
  shellbalance: z.string().max(255).nullable().optional(),
  tgbotid: z.string().max(255).nullable().optional(),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.shell.findMany({ orderBy: { id: 'desc' } });
    return ok(res, items);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const item = await prisma.shell.create({ data: schema.parse(req.body) });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.shell.update({
      where: { id: Number(req.params.id) },
      data: schema.partial().parse(req.body),
    });
    return ok(res, item, 'Shell updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.shell.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Shell deleted.');
  }),
);

export default router;
