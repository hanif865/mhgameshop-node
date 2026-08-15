import { prisma, Prisma } from '@mhgs/database';
import { gs } from '../utils/settings';
import { strRandom, money } from '../utils/helpers';
import { HttpError } from '../middleware/error';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { placeOrder } from '../providers/topup';
import { sendLike, type LikeKind } from '../providers/like.provider';
import { tryPoolTopup, tryPoolVoucherSale, restorePoolCodes, poolStockFor } from './pool.service';
import { createPayment } from '../providers/uddoktapay.provider';
import { newOrder, notifyUser } from './notification.service';
import { processComboTopup } from './combo-order.service';
import { enqueueAutoTopup } from '../queue';
import { emitOrderStatus } from '../realtime';

const ACCOUNT_INFO_TYPES = ['topup', 'ingame', 'subscription', 'autolike'];

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
  // টেলিগ্রাম থেকে অর্ডার হলে এই ইউজারের ফ্ল্যাট ছাড় (কখনো কেনা-দামের নিচে নয়)
  if (input.source === 'telegram') {
    const disc = await telegramDiscountFor(input.userId);
    if (disc > 0) price = Math.max(price - disc, buyRate);
  }
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
  if (input.source === 'telegram') {
    const disc = await telegramDiscountFor(input.userId);
    if (disc > 0) price = Math.max(price - disc, buyRate);
  }
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

  // Like সেল — সিঙ্ক্রোনাস amartopupbd API ডেলিভারি (provider webhook নেই)।
  const likeKind = likeKindOf(order.variation?.providerProductId);
  if (likeKind) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'processing' } });
    const lf = await loadOrder(order.id);
    await newOrder(lf);
    await emitOrderStatus(order.id);
    await deliverLike(lf, likeKind);
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
// Like sale — amartopupbd API (সিঙ্ক্রোনাস: কল করলেই ফল, webhook নেই)
// ভ্যারিয়েশনের Provider Product ID = 'like' বা 'maxlike' দিয়ে চেনা হয়।
// ---------------------------------------------------------------------------
function likeKindOf(pid?: string | null): LikeKind | null {
  const v = String(pid ?? '').trim().toLowerCase();
  if (v === 'like') return 'like';
  if (v === 'maxlike' || v === 'max' || v === 'max_like' || v === 'maxlikes') return 'maxlike';
  return null;
}

async function deliverLike(order: any, kind: LikeKind): Promise<void> {
  const uid = String((order.accountInfo as any)?.player_id ?? '').trim();
  if (!uid) return refundLike(order, 'UID পাওয়া যায়নি।');

  const r = await sendLike(kind, uid);
  if (r.ok) {
    const note = [r.nickname, `${r.likes} likes`, r.region].filter(Boolean).join(' • ');
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'completed', voucherCode: note || `${r.likes} likes` },
    });
    await emitOrderStatus(order.id);
    logger.info(`👍 Like order ${order.id} completed — ${r.likes} likes (uid ${uid})`);
    notifyUser(
      order.userId,
      `👍 <b>লাইক সম্পন্ন!</b>\n\nUID: <code>${uid}</code>\n` +
        (r.nickname ? `নাম: ${r.nickname}\n` : '') +
        `লাইক দেওয়া হয়েছে: <b>${r.likes}</b>`,
    ).catch(() => {});
  } else {
    await refundLike(order, r.message ?? 'লাইক দেওয়া যায়নি (হয়তো দৈনিক লিমিট শেষ)।');
  }
}

async function refundLike(order: any, reason: string): Promise<void> {
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'cancelled', voucherCode: reason },
  });
  await cancelOrder(order); // ব্যালান্স ফেরত
  await emitOrderStatus(order.id);
  logger.warn(`↩️ Like order ${order.id} refunded — ${reason}`);
  notifyUser(
    order.userId,
    `❌ <b>লাইক অর্ডার #${order.id} বাতিল</b>\n${reason}\nটাকা ফেরত দেওয়া হয়েছে।`,
  ).catch(() => {});
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

/** Cancel an auto-topup order and refund the customer (used by the worker). */
export async function cancelAndRefundAutoTopup(orderId: number): Promise<void> {
  await restorePoolCodes(orderId); // পুল থেকে নেওয়া কোড থাকলে ফেরত দিই
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status === 'cancelled') return;

  // Release any reserved auto voucher.
  await prisma.autoVoucher.updateMany({
    where: { orderId },
    data: { status: 'available', orderId: null },
  });

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
