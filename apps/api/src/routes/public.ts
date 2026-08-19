import { Router } from 'express';
import { prisma } from '../config/database';
import { asyncHandler } from '../middleware/error';
import { ok } from '../utils/response';
import { remember, CACHE_KEYS } from '../utils/cache';
import { gs } from '../utils/settings';
import { levelFor } from '../utils/levels';

const router = Router();

// Whitelist — ONLY these settings are exposed publicly. Everything else
// (provider URLs, API config, telegram, smtp, etc.) stays private.
const PUBLIC_SETTING_KEYS = new Set([
  'site_name', 'site_title', 'site_description', 'site_logo', 'site_favicon', 'home_title',
  'pwa_name', 'pwa_short_name', 'pwa_icon',
  'enable_notice', 'notice_title', 'notice_content', 'notice_background_color', 'notice_font_color',
  'facebook_url', 'instagram_url', 'youtube_url', 'whatsapp_number', 'telegram_url',
  'messenger_url', 'support_time',
  'wallet', 'uddoktapay_enabled', 'wallet_pay_image', 'instant_pay_image', 'unipin_redeem_url',
  'maintenance_mode', 'maintenance_message',
  'meta_title', 'meta_description', 'meta_keywords',
  // Facebook Pixel — শুধু এই দুটো ক্লায়েন্টে যাবে; CAPI token/test-code কখনো নয়।
  'fb_pixel_id', 'fb_pixel_enabled',
]);

// GET /api/settings — only whitelisted, safe-to-expose settings.
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    const obj: Record<string, string | null> = {};
    for (const r of rows) if (PUBLIC_SETTING_KEYS.has(r.key)) obj[r.key] = r.value;
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
    const items = await remember('mhgs:cache:latest-orders', 15, async () => {
    const orders = await prisma.order.findMany({
      where: { status: { in: ['completed', 'processing', 'autoprocessing'] } },
      orderBy: { id: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        amount: true,
        createdAt: true,
        user: { select: { name: true, avatar: true, googleAvatar: true } },
        variation: { select: { title: true } },
        comboPackage: { select: { title: true } },
        product: { select: { title: true, image: true } },
      },
    });

      return orders.map((o) => ({
        id: o.id,
        status: o.status,
        amount: o.amount,
        createdAt: o.createdAt,
        title: o.variation?.title ?? o.comboPackage?.title ?? o.product?.title ?? 'Order',
        productImage: o.product?.image ?? null,
        user: o.user?.name ?? 'User',
        avatar: o.user?.avatar ?? o.user?.googleAvatar ?? null,
      }));
    });
    return ok(res, items);
  }),
);

// GET /api/home/top-users — চলতি মাসের (বা all-time) সর্বোচ্চ খরচকারী ইউজার + metal tier।
// LatestOrders-এর মতোই শুধু safe field (নাম+অ্যাভাটার) পাবলিক করে; email/phone/balance কখনো না।
router.get(
  '/home/top-users',
  asyncHandler(async (_req, res) => {
    const s = await gs();
    if (!s.bool('top_users_enabled', true)) return ok(res, []);

    const count = Math.min(Math.max(s.int('top_users_count', 10), 1), 50);
    const monthly = s.bool('top_users_monthly', true);

    const items = await remember('mhgs:cache:top-users', 300, async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      const grp = await prisma.order.groupBy({
        by: ['userId'],
        where: {
          status: 'completed',
          user: { role: 'user', status: 1 }, // admin/reseller/banned বাদ
          ...(monthly ? { createdAt: { gte: start } } : {}),
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: count,
      });
      if (grp.length === 0) return [];

      // groupBy রিলেশন include করতে পারে না — তাই নাম/অ্যাভাটার আলাদা করে hydrate করি।
      const users = await prisma.user.findMany({
        where: { id: { in: grp.map((g) => g.userId) } },
        select: { id: true, name: true, avatar: true, googleAvatar: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));

      return grp
        .map((g, i) => {
          const u = byId.get(g.userId);
          const total = Number(g._sum.amount ?? 0); // Decimal → Number
          return {
            rank: i + 1,
            user: u?.name ?? 'User',
            avatar: u?.avatar ?? u?.googleAvatar ?? null,
            total,
            tier: levelFor(total, s).name,
          };
        })
        .filter((r) => r.total > 0);
    });

    return ok(res, items);
  }),
);

export default router;
