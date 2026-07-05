import { Router } from 'express';
import { prisma } from '../config/database';
import { asyncHandler, HttpError } from '../middleware/error';
import { ok } from '../utils/response';
import { remember, CACHE_KEYS } from '../utils/cache';

const router = Router();

// GET /api/products — active products with category + in-stock variations.
// Cached in Redis for 5 minutes; invalidated on admin catalog changes.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const products = await remember(CACHE_KEYS.products, 300, () =>
      prisma.product.findMany({
        where: { status: 1 },
        orderBy: [{ orderColumn: 'asc' }, { id: 'desc' }],
        include: {
          category: true,
          variations: {
            // Voucher variations must have stock; other types always show.
            where: {
              status: 1,
              OR: [{ stock: { gt: 0 } }, { product: { type: { not: 'voucher' } } }],
            },
            orderBy: [{ orderColumn: 'asc' }, { price: 'asc' }],
          },
        },
      }),
    );
    return ok(res, products);
  }),
);

// GET /api/products/:slug — single product with variations + combo packages.
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, status: 1 },
      include: {
        category: true,
        shell: false,
        variations: {
          where: { status: 1 },
          orderBy: [{ orderColumn: 'asc' }, { price: 'asc' }],
        },
        comboPackages: {
          where: { status: 1 },
          orderBy: [{ orderColumn: 'asc' }, { price: 'asc' }],
          include: { items: { orderBy: { orderColumn: 'asc' } } },
        },
      },
    });
    if (!product) throw new HttpError(404, 'Product not found.');
    return ok(res, product);
  }),
);

export default router;
