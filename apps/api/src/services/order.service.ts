import { prisma, Prisma } from '@mhgs/database';
import { gs } from '../utils/settings';
import { levelFor } from '../utils/levels';
import { strRandom, money } from '../utils/helpers';
import { HttpError } from '../middleware/error';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { placeOrder } from '../providers/topup';
import { placeLikeOrder } from '../providers/like';
import { tryPoolTopup, tryPoolVoucherSale, restorePoolCodes, poolStockFor } from './pool.service';
import { createPayment } from '../providers/uddoktapay.provider';
import { newOrder } from './notification.service';
import { processComboTopup } from './combo-order.service';
import { enqueueAutoTopup } from '../queue';
import { emitOrderStatus } from '../realtime';

const ACCOUNT_INFO_TYPES = ['topup', 'ingame', 'subscription', 'autolike'];

// ---------------------------------------------------------------------------
// নির্দিষ্ট গেম UID-এর মাসে-একবার টপ-আপ লিমিট
// এই UID-গুলো দিয়ে ৩০ দিনে একটার বেশি টপ-আপ করা যাবে না। শপ-অ্যাকাউন্ট নয়,
// অর্ডারে দেওয়া গেম UID ধরে ঠেকানো হয় — যেই ইউজারই দিক না কেন।
// ---------------------------------------------------------------------------
const UID_MONTHLY_LIMIT = ['3822639560', '8687072002'];
const UID_LIMIT_MESSAGE =
  'আপনাকে গেরেনা ব্লক করে দিছে তাই আপনি আগামি ৩০ দিন আর টপ আপ করতে পারবেন না';

/** ইনকামিং accountInfo-এর কোনো ফিল্ডের মান লিমিটেড UID কিনা — হলে সেই UID ফেরত দেয়। */
function limitedUidIn(accountInfo: Record<string, string> | null): string | null {
  if (!accountInfo) return null;
  for (const v of Object.values(accountInfo)) {
    const uid = String(v ?? '').trim();
    if (UID_MONTHLY_LIMIT.includes(uid)) return uid;
  }
  return null;
}

/**
 * লিমিটেড UID হলে — গত ৩০ দিনে এই UID দিয়ে বাতিল-নয় এমন কোনো অর্ডার থাকলে
 * নতুন টপ-আপ আটকে দিই (যেকোনো ইউজার)। pending (টাকা দেওয়া হয়নি) ও cancelled
 * (রিফান্ড হয়ে গেছে) গোনায় ধরি না। order.create-এর আগে ডাকা হয়।
 */
async function assertUidTopupAllowed(accountInfo: Record<string, string> | null): Promise<void> {
  const uid = limitedUidIn(accountInfo);
  if (!uid) return;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM orders
    WHERE created_at >= ${cutoff}
      AND status::text NOT IN ('pending', 'cancelled')
      AND account_info IS NOT NULL
      AND jsonb_typeof(account_info) = 'object'
      AND EXISTS (
        SELECT 1 FROM jsonb_each_text(account_info) AS kv(k, v) WHERE kv.v = ${uid}
      )
    LIMIT 1`;
  if (rows.length > 0) throw new HttpError(422, UID_LIMIT_MESSAGE);
}

/**
 * এই ইউজারের জন্য এই প্যাকেজে আলাদা দাম বসানো থাকলে সেটা, নইলে fallback।
 * user_prices raw টেবিল (schema.prisma এর বাইরে), তাই $queryRaw।
 */
export async function priceForUser(userId: number, variationId: number, fallback: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ price: unknown }[]>`
    SELECT price FROM user_prices WHERE user_id = ${userId} AND variation_id = ${variationId} LIMIT 1`;
  return rows.length ? Number(rows[0].price) : fallback;
}

/** এই ইউজারের টেলিগ্রাম ফ্ল্যাট ছাড় (৳, প্রতি প্যাকেজে)। না থাকলে 0। */
export async function telegramDiscountFor(userId: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ telegram_discount: unknown }[]>`
    SELECT telegram_discount FROM users WHERE id = ${userId} LIMIT 1`;
  return rows.length ? Number(rows[0].telegram_discount) || 0 : 0;
}

/** users.telegram_discount কলাম না থাকলে বানায় (বুট-টাইমে, idempotent)। */
export async function ensureTelegramDiscountColumn(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_discount NUMERIC(16,2) NOT NULL DEFAULT 0',
  );
}

/**
 * এই অর্ডারের *আগের* lifetime completed খরচ থেকে এই ইউজারের লেভেল ছাড় %।
 * order.create-এর আগে ডাকা হয় বলে চলতি অর্ডার নিজে গোনায় পড়ে না।
 */
async function levelDiscountPercentFor(userId: number): Promise<number> {
  const s = await gs();
  const agg = await prisma.order.aggregate({
    where: { userId, status: 'completed' },
    _sum: { amount: true },
  });
  return levelFor(Number(agg._sum.amount ?? 0), s).discountPercent;
}

/** এই ইউজার+প্যাকেজে আলাদা কাস্টম রেট (user_prices) বসানো আছে কিনা — রিসেলার exempt চেক। */
async function hasUserPrice(userId: number, variationId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: unknown }[]>`
    SELECT 1 AS n FROM user_prices WHERE user_id = ${userId} AND variation_id = ${variationId} LIMIT 1`;
  return rows.length > 0;
}

export interface AddOrderInput {
  userId: number;
  variationId: string; // numeric id or "combo-{id}"
  paymentMethod: 'wallet' | 'uddoktapay';
  accountInfo: Record<string, string> | null;
  quantity?: number;
  source?: 'web' | 'telegram';
}

export interface AddOrderResult {
  order_id: number;
  redirect_url?: string;
}

// ---------------------------------------------------------------------------
// addOrder — entry point (routes to combo or normal flow)
// ---------------------------------------------------------------------------
export async function addOrder(input: AddOrderInput): Promise<AddOrderResult> {
  const quantity = Math.max(1, input.quantity ?? 1);

  const source = input.source ?? 'web';

  // নির্দিষ্ট UID-গুলোর মাসে-একবার লিমিট (normal + combo — dispatch-এর আগেই চেক)
  await assertUidTopupAllowed(input.accountInfo);

  if (input.variationId.startsWith('combo-')) {
    return addComboOrder({ ...input, quantity, source });
  }
  return addNormalOrder({ ...input, quantity, source });
}

// ---------------------------------------------------------------------------
// Normal order
// ---------------------------------------------------------------------------
async function addNormalOrder(input: Required<AddOrderInput>): Promise<AddOrderResult> {
  const variationId = Number(input.variationId);
  if (!Number.isInteger(variationId)) throw new HttpError(422, 'Invalid variation.');

  const variation = await prisma.variation.findFirst({
    where: { id: variationId, stock: { gt: 0 } },
    include: {
      product: true,
      vouchers: { where: { status: 'available' } },
    },
  });
  if (!variation) throw new HttpError(422, 'Sorry, this item is out of stock.');

  const isVoucher = variation.product.type === 'voucher';
  if (isVoucher) {
    // রেসিপি থাকলে কোড আসবে UC-পুল থেকে, পুরনো vouchers টেবিল থেকে নয়
    const fromPool = await poolStockFor({ variationId });
    const have = fromPool ?? variation.vouchers.length;
    if (have < input.quantity) {
      throw new HttpError(422, `দুঃখিত, এই ভাউচারের স্টক ${have}টি — ${input.quantity}টি দেওয়া যাচ্ছে না।`);
    }
  }

  // এই ইউজারের জন্য আলাদা দাম বসানো থাকলে সেটাই, নইলে গ্লোবাল দাম
  let price = await priceForUser(input.userId, variation.id, Number(variation.price));
  const buyRate = Number(variation.buyRate);
  // লেভেল % ছাড় — তবে কাস্টম রেট (user_prices) থাকলে রিসেলার exempt, তাই skip
  const hasOverride = await hasUserPrice(input.userId, variation.id);
  const levelPercent = hasOverride ? 0 : await levelDiscountPercentFor(input.userId);
  if (levelPercent > 0) price = price * (1 - levelPercent / 100);
  // টেলিগ্রাম থেকে অর্ডার হলে এই ইউজারের ফ্ল্যাট ছাড় (লেভেল ছাড়ের সাথে stack)
  if (input.source === 'telegram') {
    const disc = await telegramDiscountFor(input.userId);
    if (disc > 0) price = price - disc;
  }
  // একটাই floor — সব source-এ, কখনো কেনা-দামের নিচে নামবে না
  price = Math.max(price, buyRate);
  const amount = price * input.quantity;
  const profit = amount > buyRate ? money(amount - buyRate) : '0';

  const accountInfo = ACCOUNT_INFO_TYPES.includes(variation.product.type)
    ? (input.accountInfo as Prisma.InputJsonValue)
    : Prisma.JsonNull;

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      productId: variation.productId,
      variationId: variation.id,
      quantity: input.quantity,
      amount: money(amount),
      profit,
      trackId: strRandom(),
      paymentMethod: input.paymentMethod,
      accountInfo,
    },
    include: { user: true, variation: { include: { product: true } }, product: true },
  });

  return finalizePayment(order, input.paymentMethod);
}

// ---------------------------------------------------------------------------
// Combo order
// ---------------------------------------------------------------------------
async function addComboOrder(input: Required<AddOrderInput>): Promise<AddOrderResult> {
  const comboId = Number(input.variationId.replace('combo-', ''));
  if (!Number.isInteger(comboId)) throw new HttpError(422, 'Invalid combo package.');

  const combo = await prisma.comboPackage.findFirst({
    where: { id: comboId, stock: { gt: 0 } },
    include: { product: true },
  });
  if (!combo) throw new HttpError(422, 'Sorry, this combo package is out of stock.');

  let price = Number(combo.price);
  const buyRate = Number(combo.buyRate);
  // লেভেল % ছাড় (combo-তে user_prices override নেই, তাই সরাসরি)
  const levelPercent = await levelDiscountPercentFor(input.userId);
  if (levelPercent > 0) price = price * (1 - levelPercent / 100);
  // টেলিগ্রাম ফ্ল্যাট ছাড় (লেভেল ছাড়ের সাথে stack)
  if (input.source === 'telegram') {
    const disc = await telegramDiscountFor(input.userId);
    if (disc > 0) price = price - disc;
  }
  // একটাই floor — সব source-এ, কখনো কেনা-দামের নিচে নামবে না
  price = Math.max(price, buyRate);
  const amount = price * input.quantity;
  const profit = amount > buyRate ? money(amount - buyRate) : '0';

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      productId: combo.productId,
      variationId: null,
      comboPackageId: combo.id,
      quantity: input.quantity,
      amount: money(amount),
      profit,
      trackId: strRandom(),
      paymentMethod: input.paymentMethod,
      accountInfo: input.accountInfo
        ? (input.accountInfo as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    include: { user: true, comboPackage: true, product: true },
  });

  return finalizePayment(order, input.paymentMethod);
}

// ---------------------------------------------------------------------------
// Payment dispatch (wallet vs gateway) — shared by both flows
// ---------------------------------------------------------------------------
async function finalizePayment(
  order: any,
  paymentMethod: string,
): Promise<AddOrderResult> {
  const s = await gs();

  if (s.bool('wallet') && paymentMethod === 'wallet') {
    await completeOrderWithWallet(order.id, 'wallet');
    return { order_id: order.id };
  }

  // Gateway (UddoktaPay)
  const paymentUrl = await createPayment({
    full_name: order.user?.name ?? 'Customer',
    email: order.user?.email ?? 'customer@email.com',
    amount: order.amount,
    metadata: { order_id: order.id, track_id: order.trackId, kind: 'order' },
    // Must be on the UddoktaPay-licensed domain (mhgameshop.com); Caddy proxies
    // /uddoktapay* to the API.
    redirect_url: `${env.WEB_URL}/uddoktapay/callback`,
    cancel_url: `${env.WEB_URL}/user/orders?status=cancelled`,
    webhook_url: `${env.WEB_URL}/uddoktapay`,
  });

  return { order_id: order.id, redirect_url: paymentUrl };
}

// ---------------------------------------------------------------------------
// completeOrderWithWallet — deduct balance & fulfil
// ---------------------------------------------------------------------------
export async function completeOrderWithWallet(
  orderId: number,
  paymentMethod: string,
): Promise<void> {
  const order = await loadOrder(orderId);
  if (!order) throw new HttpError(404, 'Order not found.');
  if (order.status !== 'pending') return;

  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  if (!user) throw new HttpError(404, 'User not found.');
  if (Number(order.amount) > Number(user.balance)) {
    throw new HttpError(422, 'Insufficient balance.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { balance: { decrement: order.amount } },
    });
    await tx.transaction.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        trxType: 'credit',
        amount: order.amount,
        paymentMethod,
        transactionId: strRandom(),
        remarks: `Order #${order.id} via wallet`,
      },
    });
  });

  await fulfilOrder(order);
}

// ---------------------------------------------------------------------------
// completeOrder — called after a verified gateway payment
// ---------------------------------------------------------------------------
export async function completeOrder(
  orderId: number,
  paymentMethod: string,
  transactionId: string,
): Promise<void> {
  const exists = await prisma.transaction.findFirst({ where: { transactionId } });
  if (exists) throw new HttpError(409, 'Transaction ID already exists.');

  const order = await loadOrder(orderId);
  if (!order) throw new HttpError(404, 'Order not found.');
  if (order.status !== 'pending') return;

  await prisma.transaction.create({
    data: {
      userId: order.userId,
      orderId: order.id,
      trxType: 'credit',
      amount: order.amount,
      paymentMethod,
      transactionId,
      remarks: `Order #${order.id} via ${paymentMethod}`,
    },
  });

  await fulfilOrder(order);
}

// ---------------------------------------------------------------------------
// fulfilOrder — shared fulfilment (voucher / topup / combo)
// ---------------------------------------------------------------------------
async function fulfilOrder(order: any): Promise<void> {
  // Combo
  if (order.comboPackageId) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'processing' } });
    await prisma.comboPackage.update({
      where: { id: order.comboPackageId },
      data: { stock: { decrement: 1 } },
    });
    const fresh = await loadOrder(order.id);
    await newOrder(fresh);
    await emitOrderStatus(order.id);
    await processComboTopup(fresh);
    return;
  }

  const isVoucher = order.product.type === 'voucher';

  if (isVoucher) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });
    await deliverVouchers(order);
  } else {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'processing' } });
    await prisma.variation.update({
      where: { id: order.variationId },
      data: { stock: { decrement: 1 } },
    });
  }

  const fresh = await loadOrder(order.id);
  await newOrder(fresh);
  await emitOrderStatus(order.id);

  if (!isVoucher) await processAutoTopup(fresh);
}

// ---------------------------------------------------------------------------
// deliverVouchers — hand out voucher codes
// ---------------------------------------------------------------------------
export async function deliverVouchers(order: any): Promise<void> {
  // রেসিপি থাকলে UC-পুল থেকে কোড দিই (pinbot লাগে না — কাস্টমার কোডই পায়)
  if (await tryPoolVoucherSale(order)) return;

  const vouchers = await prisma.voucher.findMany({
    where: { variationId: order.variationId, status: 'available' },
    take: order.quantity,
  });

  if (vouchers.length === 0) return;

  await prisma.$transaction([
    ...vouchers.map((v) =>
      prisma.voucher.update({
        where: { id: v.id },
        data: { status: 'sold', orderId: order.id },
      }),
    ),
    prisma.variation.update({
      where: { id: order.variationId },
      data: { stock: { decrement: vouchers.length } },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { voucherCode: vouchers.map((v) => v.code).join(','), status: 'completed' },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Auto topup — dispatched to the BullMQ worker (falls back to inline).
// ---------------------------------------------------------------------------
export async function processAutoTopup(order: any): Promise<void> {
  const queued = await enqueueAutoTopup(order.id);
  if (queued) return;
  // Redis/queue unavailable — run inline so orders still get fulfilled.
  try {
    await runAutoTopup(order);
  } catch (e) {
    logger.error(`❌ Auto topup (inline) error (order ${order.id}): ${(e as Error).message}`);
  }
}

/**
 * The actual automatic FreeFire/UniPin delivery. Throws on failure so the
 * worker can retry; on the final failure the worker refunds the order.
 */
export async function runAutoTopup(order: any): Promise<void> {
  // Auto-like has its own synchronous path (no voucher/shell/webhook).
  if (order.product.type === 'autolike') return runAutoLike(order);

  const s = await gs();

  if (order.product.type !== 'topup') return;
  if (!order.variation?.automatic) return;
  if (!s.bool('enable_auto_topup')) return;

  // সক্রিয় gateway অনুযায়ী কনফিগ আছে কিনা দেখি (আগে শুধু topupnet এর
  // free_fire_server_url দেখত, তাই pinbot এ চললেও ওটা সেট রাখতে হত)
  const gateway = (s.str('topup_gateway') || 'topupnet').trim().toLowerCase();
  const providerReady = gateway === 'pinbot' ? !!s.str('pinbot_api_key') : !!s.str('free_fire_server_url');
  if (!providerReady) {
    logger.warn(`⚠️ Auto topup: ${gateway} gateway কনফিগ করা নেই (order ${order.id})`);
    return;
  }

  // UC-পুলে রেসিপি থাকলে সেখান থেকেই ফুলফিল হবে (নতুন পদ্ধতি)
  if (await tryPoolTopup(order)) return;

  const autoVoucher = await prisma.autoVoucher.findFirst({
    where: { variationId: order.variationId, status: 'available' },
  });

  // শেল অর্ডার চেনার উপায় প্যাকেজ কোড — প্রোডাক্টে শেল বাঁধা থাক বা না থাক।
  // (কোন অ্যাকাউন্ট দিয়ে যাবে সেটা pickShell ঠিক করে: বাঁধা থাকলে সেটা,
  //  নইলে যেটা চালু আছে।)
  const isShellOrder = !!order.variation?.providerProductId;

  if (!autoVoucher && !isShellOrder) {
    // চুপ করে return করলে অর্ডার processing এ ঝুলে থাকত আর টাকা আটকে
    // যেত। throw করলে worker রিট্রাই করে, শেষে ক্যান্সেল ও রিফান্ড হয়।
    logger.error(`❌ Auto topup: ভাউচারও নেই, প্যাকেজ কোডও নেই (order ${order.id})`);
    throw new Error('এই প্যাকেজে প্রোভাইডার কোড বসানো নেই।');
  }

  if (autoVoucher) {
    await prisma.$transaction([
      prisma.autoVoucher.update({
        where: { id: autoVoucher.id },
        data: { status: 'sold', orderId: order.id },
      }),
      prisma.variation.update({
        where: { id: order.variationId },
        data: { stock: { decrement: 1 } },
      }),
      prisma.order.update({
        where: { id: order.id },
        // completed নয় — প্রোভাইডারের webhook এলে তবেই
        data: { status: 'autoprocessing', voucherCode: autoVoucher.code },
      }),
    ]);
  } else {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'autoprocessing' } });
  }

  await emitOrderStatus(order.id);
  await placeOrder(order, autoVoucher ? { id: autoVoucher.id, code: autoVoucher.code } : null);
}

/**
 * Auto-like delivery (Free Fire). Gateway (amartopupbd | pinbot) is chosen by
 * the `like_gateway` setting inside providers/like.ts. Synchronous: call the API,
 * complete on success, cancel+refund when 0 likes were given. Throwing here
 * makes the worker retry and finally refund (transient / misconfig cases).
 */
async function runAutoLike(order: any): Promise<void> {
  const result = await placeLikeOrder(order);

  // সফলভাবে কল হলো কিন্তু 0 লাইক (প্লেয়ার আজকের লিমিটে / আগেই ম্যাক্স) —
  // রিট্রাই অর্থহীন ও API quota নষ্ট করে, তাই এখানেই cancel + refund।
  if (result.likesGiven <= 0) {
    logger.warn(`⚠️ AutoLike: 0 likes given (order ${order.id}) — cancelling & refunding`);
    await cancelAndRefundAutoTopup(order.id);
    return;
  }

  const msg =
    `✅ ${result.likesGiven} likes sent to ${result.nickname}` +
    (result.region ? ` (${result.region})` : '') +
    (result.before && result.after ? ` — ${result.before} → ${result.after}` : '');

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'completed', deliveryMessage: msg },
  });
  logger.info(`✅ AutoLike done order ${order.id}: ${result.likesGiven} likes → ${result.nickname}`);
  await emitOrderStatus(order.id);
}

/** Cancel an auto-topup order and refund the customer (used by the worker). */
export async function cancelAndRefundAutoTopup(orderId: number): Promise<void> {
  await restorePoolCodes(orderId); // পুল থেকে নেওয়া কোড থাকলে ফেরত দিই
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true },
  });
  if (!order || order.status === 'cancelled') return;

  // Release any reserved auto voucher.
  await prisma.autoVoucher.updateMany({
    where: { orderId },
    data: { status: 'available', orderId: null },
  });

  // autolike: fulfilOrder এ কমানো ভ্যারিয়েশন স্টক ফেরত দিই (ভাউচার/পুল নেই বলে
  // উপরের release গুলো no-op; শুধু স্টকটাই ফেরত দেওয়ার আছে)।
  if (order.product?.type === 'autolike' && order.variationId) {
    await prisma.variation.update({
      where: { id: order.variationId },
      data: { stock: { increment: 1 } },
    });
  }

  await prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
  await cancelOrder(order);
  await emitOrderStatus(orderId);
}

// ---------------------------------------------------------------------------
// cancelOrder — refund the wallet
// ---------------------------------------------------------------------------
export async function cancelOrder(order: any): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: order.userId },
      data: { balance: { increment: order.amount } },
    }),
    prisma.transaction.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        trxType: 'debit',
        amount: order.amount,
        paymentMethod: 'wallet',
        transactionId: strRandom(),
        remarks: `Refund for Order #${order.id}`,
      },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// helper: load an order with the relations fulfilment needs
// ---------------------------------------------------------------------------
export function loadOrder(orderId: number) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      product: true,
      variation: { include: { product: true } },
      comboPackage: true,
    },
  });
}
