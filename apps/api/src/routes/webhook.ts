import { Router, type Request } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { gs } from '../utils/settings';
import { asyncHandler } from '../middleware/error';
import { logger } from '../utils/logger';
import { verifyPayment } from '../providers/uddoktapay.provider';
import { completeOrder } from '../services/order.service';
import { completeDeposit } from '../services/deposit.service';
import { maybeFinalize, cancelAndRefund } from '../services/combo-order.service';
import { comboItemUpdate } from '../services/notification.service';
import { emitOrderStatus } from '../realtime';

const router = Router();

// Parse UddoktaPay metadata (may arrive as an object or a JSON string).
function parseMeta(m: unknown): Record<string, any> {
  if (!m) return {};
  if (typeof m === 'string') {
    try {
      return JSON.parse(m);
    } catch {
      return {};
    }
  }
  return m as Record<string, any>;
}

// Complete an order or deposit from verified payment metadata.
async function settlePayment(
  meta: Record<string, any>,
  paymentMethod: string,
  transactionId: string,
): Promise<'deposit' | 'order' | null> {
  if (meta.kind === 'deposit' && meta.deposit_id) {
    await completeDeposit(Number(meta.deposit_id), paymentMethod, transactionId);
    return 'deposit';
  }
  if (meta.order_id) {
    await completeOrder(Number(meta.order_id), paymentMethod, transactionId);
    return 'order';
  }
  logger.warn(`UddoktaPay: no resolvable metadata ${JSON.stringify(meta)}`);
  return null;
}

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
// POST /api/webhook/uddoktapay — server-to-server webhook.
// Validates the API-key header, then settles from the body (verifying if needed).
// ---------------------------------------------------------------------------
router.post(
  '/uddoktapay',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    logger.info(`📩 UddoktaPay webhook: ${JSON.stringify(body)}`);

    // Optional API-key validation (UddoktaPay sends it in this header).
    const s = await gs();
    const myKey = (s.str('uddoktapay_api_key') || process.env.UDDOKTAPAY_API_KEY || '').trim();
    const headerKey = String(req.headers['rt-uddoktapay-api-key'] ?? '').trim();
    if (myKey && headerKey && headerKey !== myKey) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    let status = body.status;
    let meta = parseMeta(body.metadata);
    let paymentMethod = body.payment_method ?? 'UddoktaPay';
    let transactionId = body.transaction_id ?? body.invoice_id;

    // Fall back to Verify Payment if the body is missing what we need.
    const needsVerify = !status || (!meta.order_id && !meta.deposit_id);
    if (needsVerify && body.invoice_id) {
      try {
        const v = await verifyPayment(String(body.invoice_id));
        status = v.status;
        meta = parseMeta(v.metadata);
        paymentMethod = v.payment_method ?? paymentMethod;
        transactionId = v.transaction_id ?? transactionId;
      } catch (e) {
        logger.error(`UddoktaPay verify failed: ${(e as Error).message}`);
      }
    }

    if (String(status).toUpperCase() === 'COMPLETED') {
      await settlePayment(meta, paymentMethod, String(transactionId));
    }
    return res.json({ success: true });
  }),
);

// ---------------------------------------------------------------------------
// GET/POST /api/webhook/uddoktapay/callback — user redirect after payment.
// This is the primary completion path: verify, settle, then redirect to the web app.
// ---------------------------------------------------------------------------
async function handleCallback(req: Request, res: any) {
  const invoiceId = (req.query?.invoice_id as string) || req.body?.invoice_id;
  if (!invoiceId) return res.redirect(`${env.WEB_URL}/user/orders`);
  try {
    const v = await verifyPayment(String(invoiceId)); // throws unless COMPLETED
    const meta = parseMeta(v.metadata);
    const kind = await settlePayment(
      meta,
      v.payment_method ?? 'UddoktaPay',
      v.transaction_id ?? String(invoiceId),
    );
    if (kind === 'deposit') return res.redirect(`${env.WEB_URL}/user/add-funds?status=success`);
    if (kind === 'order') {
      const order = meta.order_id
        ? await prisma.order.findUnique({
            where: { id: Number(meta.order_id) },
            include: { product: true },
          })
        : null;
      const dest = order?.product?.type === 'voucher' ? 'codes' : 'orders';
      return res.redirect(`${env.WEB_URL}/user/${dest}?status=success`);
    }
    return res.redirect(`${env.WEB_URL}/user/orders?status=success`);
  } catch (e) {
    logger.error(`UddoktaPay callback error: ${(e as Error).message}`);
    return res.redirect(`${env.WEB_URL}/user/orders?status=failed`);
  }
}
router.get('/uddoktapay/callback', asyncHandler(handleCallback));
router.post('/uddoktapay/callback', asyncHandler(handleCallback));

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
