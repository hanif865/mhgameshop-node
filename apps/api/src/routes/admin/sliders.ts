import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok, created } from '../../utils/response';
import { uploader, relPath } from '../../config/upload';

const router = Router();

const schema = z.object({
  title: z.string().max(255).nullable().optional(),
  image: z.string().max(1024).nullable().optional(),
  url: z.string().max(1024).nullable().optional(),
  orderColumn: z.coerce.number().int().default(0),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.slider.findMany({
      orderBy: [{ orderColumn: 'asc' }, { id: 'desc' }],
    });
    return ok(res, items);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const item = await prisma.slider.create({ data: schema.parse(req.body) });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.slider.update({
      where: { id: Number(req.params.id) },
      data: schema.partial().parse(req.body),
    });
    return ok(res, item, 'Slider updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.slider.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Slider deleted.');
  }),
);

// PUT /api/admin/sliders/:id/image
router.put(
  '/:id/image',
  uploader('sliders').single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(422, 'No image uploaded.');
    const image = relPath('sliders', req.file.filename);
    const item = await prisma.slider.update({
      where: { id: Number(req.params.id) },
      data: { image },
    });
    return ok(res, item, 'Image updated.');
  }),
);

export default router;
