import { prisma } from './config/database';
import { getIO } from './config/socket';
import { logger } from './utils/logger';

/**
 * Realtime broadcasts. Safe no-ops when Socket.io isn't initialized (e.g. in
 * the worker process), so these can be called from anywhere.
 */

/** Notify a user that one of their orders changed status. */
export async function emitOrderStatus(orderId: number): Promise<void> {
  const io = getIO();
  if (!io) return;
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        voucherCode: true,
        deliveryMessage: true,
      },
    });
    if (!order) return;
    io.to(`user:${order.userId}`).emit('order:status', order);
    io.to('admins').emit('order:updated', { id: order.id, status: order.status });
    await emitPendingCount();
  } catch (e) {
    logger.error(`emitOrderStatus error: ${(e as Error).message}`);
  }
}

/** Push the live pending-orders count to all admins. */
export async function emitPendingCount(): Promise<void> {
  const io = getIO();
  if (!io) return;
  try {
    const count = await prisma.order.count({
      where: { status: { in: ['pending', 'processing', 'autoprocessing'] } },
    });
    io.to('admins').emit('orders:pending', { count });
  } catch (e) {
    logger.error(`emitPendingCount error: ${(e as Error).message}`);
  }
}
