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
import { restorePoolCodes, markPoolCodesInvalid } from '../services/pool.service';
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
  // PinBot wordings — same meaning, so they must cancel + refund too.
  'UID region mismatch',
  'Insufficient Garena shells',
  'Wrong OTP',
  'failed (Wrong OTP)',
  'Invalid Voucher',
]);

/**
 * উপরের তালিকা হুবহু মেলাতে হয়, তাই প্রোভাইডার একটু অন্যভাবে লিখলেই
 * অর্ডার processing এ ঝুলে থাকত আর টাকা আটকে যেত। এগুলো সেই একই
 * অর্থের বার্তা — যেভাবেই লেখা হোক ধরা পড়বে।
 */
const CANCEL_PATTERNS = [
  /prelogin\s*failed/i,          // অ্যাকাউন্টে লগইন হয়নি
  /login\s*(failed|error)/i,
  /invalid\s*(player|uid|user)/i,
  /region\s*(mis)?match/i,
  /wrong\s*otp/i,
  /consumed|already\s*(used|redeem)/i,
  /insufficient|not\s*enough/i,
  /invalid\s*(voucher|serial|pin|package)/i,
  /plan\s*expired|unauthorized|invalid\s*api/i,
];

/** এই ব্যর্থতায় অর্ডার ক্যান্সেল করে টাকা ফেরত দেওয়া উচিত? */
function shouldCancel(content: unknown): boolean {
  const s = String(content ?? '').trim();
  if (!s) return false;
  return CANCEL_CONTENTS.has(s) || CANCEL_PATTERNS.some((re) => re.test(s));
}

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

    let rawOrderId = req.body?.orderid ?? req.body?.merchant_order_id;
    let status = req.body?.status;
    let content = req.body?.content ?? req.body?.message ?? null;

    // PinBot sends content as { batch: [{ ok, detail, uc|package }] } and can
    // report 'partial'. Flatten it to the plain string / success|failed shape
    // the rest of this handler (and CANCEL_CONTENTS) already understands.
    if (content && typeof content === 'object' && Array.isArray((content as any).batch)) {
      const batch = (content as any).batch as Array<{ ok?: boolean; detail?: string }>;
      const details = batch
        .map((b) => String(b.detail ?? '').replace(/[✅❌]/g, '').trim())
        .filter(Boolean);
      const failed = batch.find((b) => !b.ok);
      // Prefer the failing reason so CANCEL_CONTENTS can match on it.
      content =
        (failed ? String(failed.detail ?? '').replace(/[✅❌]/g, '').trim() : details[0]) || null;
      if (String(status).toLowerCase() === 'partial') {
        status = batch.some((b) => b.ok) ? 'success' : 'failed';
      }
    }

    if (!rawOrderId) return res.status(400).json({ message: 'Missing order ID' });

    // ৫টার বেশি কোড লাগলে পুল অর্ডার ভাগ হয়ে যায় এবং orderid হয়
    // "{orderId}-b2"। সেটা কম্বো সাব-আইটেম নয় — মূল অর্ডারেরই ফল।
    const poolBatch = String(rawOrderId).match(/^(\d+)-b\d+$/i);
    const isPoolBatch = !!poolBatch;
    if (poolBatch) rawOrderId = poolBatch[1];

    // ---- Combo sub-item: "{orderId}-{itemIndex}" ----
    if (!isPoolBatch && String(rawOrderId).includes('-')) {
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
        if (shouldCancel(content)) {
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

    // ভাগ হওয়া পুল অর্ডারে একাধিক ফল আসে। আগের ভাগ সফল হয়ে completed
    // হয়ে গেলেও পরের ভাগ ব্যর্থ হলে সেটা আমলে নিতেই হবে — নইলে
    // কাস্টমার অর্ধেক পেয়ে পুরো টাকা দিত।
    const laterFailure = isPoolBatch && status !== 'success' && order.status === 'completed';
    if (!laterFailure && (order.status === 'completed' || order.status === 'cancelled')) {
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

      // যে কোডগুলো নেওয়া হয়েছিল সেগুলো (voucherCode ওভাররাইট করার আগে ধরে রাখি)
      const usedCodes = String(order.voucherCode ?? '').split(',').map((c) => c.trim()).filter(Boolean);

      // ফেল মানেই কাস্টমার আইটেম পায়নি — অর্ডার processing এ ঝুলিয়ে না রেখে
      // সবসময় ক্যান্সেল করে টাকা ফেরত দিই। (আগে শুধু চেনা কারণে হত, বাকিগুলো
      // আটকে থাকত।)
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'cancelled', voucherCode: content },
      });

      // অটো-ভাউচার রিজার্ভ থাকলে ছেড়ে দিই
      const autoVoucher = await prisma.autoVoucher.findFirst({ where: { orderId: order.id } });
      if (autoVoucher) {
        await prisma.autoVoucher.update({
          where: { id: autoVoucher.id },
          data: { status: 'available', orderId: null },
        });
      }

      // UC-পুলের কোড: ব্যবহৃত হয়ে গেলে নষ্ট চিহ্ন, নইলে স্টকে ফেরত
      if (/consumed|already.*(used|redeem)|invalid voucher/i.test(String(content ?? ''))) {
        await markPoolCodesInvalid(usedCodes);
      } else {
        await restorePoolCodes(order.id);
      }

      // টাকা ফেরত
      await prisma.user.update({
        where: { id: order.userId },
        data: { balance: { increment: order.amount } },
      });

      logger.warn(`⚠️ Order ${order.id} cancelled & refunded ৳${order.amount} (${content})`);
      await emitOrderStatus(order.id);
    }

    return res.json({ message: 'Processed' });
  }),
);

export default router;
