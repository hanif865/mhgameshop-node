import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok, created, paginated, parsePagination } from '../../utils/response';
import { uploader, relPath } from '../../config/upload';

const router = Router();

const schema = z.object({
  categoryId: z.coerce.number().int(),
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  type: z.enum(['topup', 'voucher', 'ingame', 'subscription', 'autolike']),
  description: z.string().nullable().optional(),
  image: z.string().max(1024).nullable().optional(),
  shellId: z.coerce.number().int().nullable().optional(),
  orderColumn: z.coerce.number().int().default(0),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

// GET /api/admin/products — paginated, with category + variations count.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const search = String(req.query.search ?? '').trim();
    const where = search
      ? { title: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ orderColumn: 'asc' }, { id: 'desc' }],
        skip,
        take,
        include: { category: true, _count: { select: { variations: true, comboPackages: true } } },
      }),
      prisma.product.count({ where }),
    ]);
    return paginated(res, items, { page, perPage, total });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      include: { category: true },
    });
    if (!item) throw new HttpError(404, 'Product not found.');
    return ok(res, item);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const item = await prisma.product.create({ data });
    return created(res, item);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const item = await prisma.product.update({ where: { id: Number(req.params.id) }, data });
    return ok(res, item, 'Product updated.');
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.product.delete({ where: { id: Number(req.params.id) } });
    return ok(res, null, 'Product deleted.');
  }),
);

// PUT /api/admin/products/:id/image — multipart upload.
router.put(
  '/:id/image',
  uploader('products').single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(422, 'No image uploaded.');
    const image = relPath('products', req.file.filename);
    const item = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: { image },
    });
    return ok(res, item, 'Image updated.');
  }),
);

export default router;
