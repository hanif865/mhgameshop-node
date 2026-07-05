import { prisma, Prisma } from '@mhgs/database';
import { gs } from '../utils/settings';
import { strRandom, money } from '../utils/helpers';
import { HttpError } from '../middleware/error';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { placeOrder } from '../providers/topupnet.provider';
import { createPayment } from '../providers/uddoktapay.provider';
import { newOrder } from './notification.service';
import { processComboTopup } from './combo-order.service';
import { enqueueAutoTopup } from '../queue';
import { emitOrderStatus } from '../realtime';

const ACCOUNT_INFO_TYPES = ['topup', 'ingame', 'subscription', 'autolike'];

export interface AddOrderInput {
  userId: number;
  variationId: string; // numeric id or "combo-{id}"
  paymentMethod: 'wallet' | 'uddoktapay';
  accountInfo: Record<string, string> | null;
  quantity?: number;
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

  if (input.variationId.startsWith('combo-')) {
    return addComboOrder({ ...input, quantity });
  }
  return addNormalOrder({ ...input, quantity });
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
  if (isVoucher && variation.vouchers.length < input.quantity) {
    throw new HttpError(422, 'Sorry, this voucher is out of stock.');
  }

  const price = Number(variation.price);
  const amount = price * input.quantity;
  const buyRate = Number(variation.buyRate);
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

  const price = Number(combo.price);
  const amount = price * input.quantity;
  const buyRate = Number(combo.buyRate);
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
    redirect_url: `${env.WEB_URL}/user/orders?status=success`,
    cancel_url: `${env.WEB_URL}/user/orders?status=cancelled`,
    webhook_url: `${env.APP_URL}/api/webhook/uddoktapay`,
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
  if (!s.str('free_fire_server_url')) return;

  const autoVoucher = await prisma.autoVoucher.findFirst({
    where: { variationId: order.variationId, status: 'available' },
  });

  if (!autoVoucher && order.product.shellId == null) {
    logger.warn(`⚠️ Auto topup skipped: no voucher and no shell (order ${order.id})`);
    return;
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
        data: { status: 'completed', voucherCode: autoVoucher.code },
      }),
    ]);
  } else {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });
  }

  await emitOrderStatus(order.id);
  await placeOrder(order, autoVoucher ? { id: autoVoucher.id, code: autoVoucher.code } : null);
}

/** Cancel an auto-topup order and refund the customer (used by the worker). */
export async function cancelAndRefundAutoTopup(orderId: number): Promise<void> {
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
