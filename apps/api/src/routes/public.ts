import { Router } from 'express';
import { prisma } from '../config/database';
import { asyncHandler } from '../middleware/error';
import { ok } from '../utils/response';
import { remember, CACHE_KEYS } from '../utils/cache';

const router = Router();

// Keys that must never be exposed publicly.
const SENSITIVE = ['key', 'secret', 'password', 'token', 'smtp', 'client_id', 'autocode'];

function isSensitive(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE.some((s) => k.includes(s));
}

// GET /api/settings — public, non-sensitive settings as a key-value object.
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    const obj: Record<string, string | null> = {};
    for (const r of rows) if (!isSensitive(r.key)) obj[r.key] = r.value;
    return ok(res, obj);
  }),
);

// GET /api/sliders — active sliders.
router.get(
  '/sliders',
  asyncHandler(async (_req, res) => {
    const items = await remember(CACHE_KEYS.sliders, 300, () =>
      prisma.slider.findMany({
        where: { status: 1 },
        orderBy: [{ orderColumn: 'asc' }, { id: 'desc' }],
      }),
    );
    return ok(res, items);
  }),
);

// GET /api/categories — active categories (for nav/filters).
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const items = await prisma.category.findMany({
      where: { status: 1 },
      orderBy: [{ orderColumn: 'asc' }, { id: 'asc' }],
    });
    return ok(res, items);
  }),
);

// GET /api/home/latest-orders — latest completed/processing orders for the home feed.
router.get(
  '/home/latest-orders',
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      where: { status: { in: ['completed', 'processing', 'autoprocessing'] } },
      orderBy: { id: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        createdAt: true,
        accountInfo: true,
        user: { select: { name: true } },
        variation: { select: { title: true } },
        comboPackage: { select: { title: true } },
        product: { select: { title: true } },
      },
    });

    // Mask player id / username lightly for the public feed.
    const masked = orders.map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: o.createdAt,
      title: o.variation?.title ?? o.comboPackage?.title ?? o.product?.title ?? 'Order',
      user: maskName(o.user?.name ?? 'User'),
    }));
    return ok(res, masked);
  }),
);

function maskName(name: string): string {
  if (name.length <= 2) return name[0] + '*';
  return name.slice(0, 2) + '*'.repeat(Math.min(4, name.length - 2));
}

export default router;
