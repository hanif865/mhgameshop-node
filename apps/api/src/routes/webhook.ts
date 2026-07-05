import { Router } from 'express';
import { prisma } from '../config/database';
import { asyncHandler } from '../middleware/error';
import { logger } from '../utils/logger';
import { verifyPayment } from '../providers/uddoktapay.provider';
import { completeOrder } from '../services/order.service';
import { completeDeposit } from '../services/deposit.service';
import { maybeFinalize, cancelAndRefund } from '../services/combo-order.service';
import { comboItemUpdate } from '../services/notification.service';
import { emitOrderStatus } from '../realtime';

const router = Router();

// Error content strings that trigger auto-cancel + refund (from Laravel).
const CANCEL_CONTENTS = new Set([
  'Invalid Player ID',
  'Consumed Voucher',
  'Amount unavailable',
  'Region mismatch',
  'Invalid Serial or PIN',
  'region does not match',
]);

// ---------------------------------------------------------------------------
// POST /api/webhook/uddoktapay — verify payment, then fulfil order or deposit.
// ---------------------------------------------------------------------------
router.post(
  '/uddoktapay',
  asyncHandler(async (req, res) => {
    const invoiceId =
      req.body?.invoice_id || req.query?.invoice_id || req.body?.invoiceId || null;

    if (!invoiceId) return res.status(400).json({ success: false, message: 'Missing invoice_id.' });

    // Verify server-side (never trust the raw webhook body).
    const verified = await verifyPayment(String(invoiceId));
    const meta = (verified.metadata ?? {}) as Record<string, unknown>;
    const paymentMethod = verified.payment_method ?? 'UddoktaPay';
    const transactionId = verified.transaction_id ?? String(invoiceId);

    if (meta.kind === 'deposit' && meta.deposit_id) {
      await completeDeposit(Number(meta.deposit_id), paymentMethod, transactionId);
    } else if (meta.order_id) {
      await completeOrder(Number(meta.order_id), paymentMethod, transactionId);
    } else {
      logger.warn(`UddoktaPay webhook with no resolvable metadata: ${JSON.stringify(meta)}`);
    }

    return res.json({ success: true });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/webhook/auto-topup — TopupNet delivery result.
// ---------------------------------------------------------------------------
router.post(
  '/auto-topup',
  asyncHandler(async (req, res) => {
    logger.info(`📩 TopupNet webhook: ${JSON.stringify(req.body)}`);

    const rawOrderId = req.body?.orderid ?? req.body?.merchant_order_id;
    const status = req.body?.status;
    const content = req.body?.content ?? req.body?.message ?? null;

    if (!rawOrderId) return res.status(400).json({ message: 'Missing order ID' });

    // ---- Combo sub-item: "{orderId}-{itemIndex}" ----
    if (String(rawOrderId).includes('-')) {
      const [orderIdStr, itemIndexStr] = String(rawOrderId).split('-');
      const orderId = Number(orderIdStr);
      const itemIndex = Number(itemIndexStr);

      const coi = await prisma.comboOrderItem.findFirst({ where: { orderId, itemIndex } });
      if (!coi) return res.status(404).json({ message: 'Combo item not found' });

      if (coi.status !== 'pending') {
        return res.json({ message: 'Already processed' });
      }

      if (status === 'success') {
        await prisma.comboOrderItem.update({
          where: { id: coi.id },
          data: { status: 'success', responseContent: content },
        });
        await comboItemUpdate(orderId, itemIndex, 'success', content);
        await maybeFinalize(orderId);
      } else {
        await prisma.comboOrderItem.update({
          where: { id: coi.id },
          data: { status: 'failed', responseContent: content },
        });
        await comboItemUpdate(orderId, itemIndex, 'failed', content);

        // A fatal reason cancels & refunds the whole combo order.
        if (content && CANCEL_CONTENTS.has(String(content))) {
          await cancelAndRefund(orderId);
        } else {
          await maybeFinalize(orderId);
        }
      }

      return res.json({ message: 'Combo item processed' });
    }

    // ---- Normal order ----
    const orderId = Number(rawOrderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status === 'completed' || order.status === 'cancelled') {
      return res.json({ message: 'Already processed' });
    }

    if (status === 'success') {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });
      await emitOrderStatus(order.id);
      logger.info(`✅ Order ${order.id} completed via webhook`);
      return res.json({ message: 'Order completed' });
    }

    if (status === 'failed' || status === 'error') {
      logger.warn(`⚠️ Order ${order.id} failed: ${content}`);
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'processing', voucherCode: content },
      });

      if (content && CANCEL_CONTENTS.has(String(content))) {
        // Cancel + rollback voucher + refund balance (exact Laravel behaviour).
        await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });

        const autoVoucher = await prisma.autoVoucher.findFirst({
          where: { orderId: order.id },
        });
        if (autoVoucher) {
          await prisma.autoVoucher.update({
            where: { id: autoVoucher.id },
            data: { status: 'available', orderId: null },
          });
        }

        await prisma.user.update({
          where: { id: order.userId },
          data: { balance: { increment: order.amount } },
        });

        logger.warn(`⚠️ Order ${order.id} cancelled & refunded (${content})`);
      }
      await emitOrderStatus(order.id);
    }

    return res.json({ message: 'Processed' });
  }),
);

export default router;
