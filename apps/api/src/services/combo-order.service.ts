import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { placeComboVoucherOrder } from '../providers/topup';
import { cancelOrder } from './order.service';
import { tryPoolTopup, restorePoolCodes } from './pool.service';
import { emitOrderStatus } from '../realtime';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fan out a combo order into per-item TopupNet calls.
 *
 * Each unit of each ComboPackageItem becomes one ComboOrderItem with a unique
 * item_index. The TopupNet call uses orderid = "{orderId}-{itemIndex}", so the
 * webhook can resolve each sub-item independently. The order stays in
 * `autoprocessing` until every sub-item is resolved by maybeFinalize().
 */
export async function processComboTopup(order: any): Promise<void> {
  // কম্বোতে UC-রেসিপি বসানো থাকলে পুল থেকেই যাবে (একটাই ব্যাচ কল, per-item নয়)
  if (await tryPoolTopup(order)) return;

  const items = await prisma.comboPackageItem.findMany({
    where: { comboPackageId: order.comboPackageId },
    orderBy: { orderColumn: 'asc' },
  });

  if (items.length === 0) {
    logger.error(`Combo: no items found (combo ${order.comboPackageId})`);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'processing' } });
    return;
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: 'autoprocessing' } });

  let itemIndex = 0;

  for (const item of items) {
    // Pull the available codes for this item up-front, consume as we go.
    const available = await prisma.comboPackageVoucher.findMany({
      where: { comboPackageItemId: item.id, status: 'available' },
      take: item.quantity,
    });

    for (let q = 0; q < item.quantity; q++) {
      const voucher = available[q];

      if (!voucher) {
        await prisma.comboOrderItem.create({
          data: {
            orderId: order.id,
            comboPackageItemId: item.id,
            itemIndex,
            status: 'failed',
            responseContent: 'No voucher code available for this item.',
          },
        });
        logger.error(`Combo: no voucher for item ${item.id} (order ${order.id})`);
        itemIndex++;
        continue;
      }

      // Reserve the voucher + create the tracking row.
      await prisma.comboPackageVoucher.update({
        where: { id: voucher.id },
        data: { status: 'sold', orderId: order.id },
      });
      const coi = await prisma.comboOrderItem.create({
        data: {
          orderId: order.id,
          comboPackageItemId: item.id,
          comboPackageVoucherId: voucher.id,
          itemIndex,
          status: 'pending',
        },
      });

      const result = await placeComboVoucherOrder(order, voucher.code, itemIndex);
      if (!result.ok) {
        await prisma.comboOrderItem.update({
          where: { id: coi.id },
          data: {
            status: 'failed',
            responseContent: result.data ? JSON.stringify(result.data).slice(0, 500) : 'Provider rejected the request.',
          },
        });
      }

      itemIndex++;
      await sleep(1000); // rate limit — one call per second (matches Laravel)
    }
  }

  await maybeFinalize(order.id);
}

/**
 * Check whether every ComboOrderItem is resolved and set the order's final
 * status. Called both after the initial fan-out and from each webhook.
 */
export async function maybeFinalize(orderId: number): Promise<void> {
  const items = await prisma.comboOrderItem.findMany({ where: { orderId } });
  if (items.length === 0) return;

  const pending = items.filter((i) => i.status === 'pending').length;
  if (pending > 0) return; // still waiting on webhooks

  const success = items.filter((i) => i.status === 'success').length;

  if (success === items.length) {
    await prisma.order.update({ where: { id: orderId }, data: { status: 'completed' } });
    logger.info(`✅ Combo order ${orderId} completed (${success}/${items.length})`);
  } else if (success === 0) {
    // Everything failed — cancel and refund the whole order.
    await cancelAndRefund(orderId);
  } else {
    // Partial success — hold for manual review.
    await prisma.order.update({ where: { id: orderId }, data: { status: 'processing' } });
    logger.warn(`⚠️ Combo order ${orderId} partial (${success}/${items.length}) → processing`);
  }
  await emitOrderStatus(orderId);
}

/**
 * Cancel a combo order: release reserved vouchers, refund the wallet, and mark
 * the order cancelled.
 */
export async function cancelAndRefund(orderId: number): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status === 'cancelled') return;

  // পুল থেকে নেওয়া কোড থাকলে সেগুলো ফেরত দিই
  await restorePoolCodes(orderId);

  // Release any reserved combo vouchers.
  await prisma.comboPackageVoucher.updateMany({
    where: { orderId },
    data: { status: 'available', orderId: null },
  });

  await prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
  await cancelOrder(order);
  await emitOrderStatus(orderId);
  logger.warn(`⚠️ Combo order ${orderId} cancelled & refunded`);
}
