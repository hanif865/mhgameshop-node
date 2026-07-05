import { Router } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { ok } from '../../utils/response';

const router = Router();

function startOf(period: 'day' | 'week' | 'month'): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - 7);
  if (period === 'month') d.setMonth(d.getMonth() - 1);
  return d;
}

// GET /api/admin/dashboard
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const today = startOf('day');
    const week = startOf('week');
    const month = startOf('month');
    const completed = { status: 'completed' as const };

    const [
      ordersToday,
      ordersWeek,
      ordersMonth,
      revenueToday,
      revenueMonth,
      totalUsers,
      newUsersToday,
      pendingOrders,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.order.count({ where: { createdAt: { gte: week } } }),
      prisma.order.count({ where: { createdAt: { gte: month } } }),
      prisma.order.aggregate({
        _sum: { amount: true },
        where: { ...completed, createdAt: { gte: today } },
      }),
      prisma.order.aggregate({
        _sum: { amount: true, profit: true },
        where: { ...completed, createdAt: { gte: month } },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.order.count({ where: { status: { in: ['pending', 'processing', 'autoprocessing'] } } }),
      prisma.order.findMany({
        take: 10,
        orderBy: { id: 'desc' },
        include: { user: true, product: true, variation: true, comboPackage: true },
      }),
    ]);

    return ok(res, {
      orders: { today: ordersToday, week: ordersWeek, month: ordersMonth },
      revenue: {
        today: revenueToday._sum.amount ?? '0',
        month: revenueMonth._sum.amount ?? '0',
        monthProfit: revenueMonth._sum.profit ?? '0',
      },
      users: { total: totalUsers, newToday: newUsersToday },
      pendingOrders,
      recentOrders,
    });
  }),
);

export default router;
