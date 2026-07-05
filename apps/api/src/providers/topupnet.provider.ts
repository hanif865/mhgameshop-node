import { prisma } from '../config/database';
import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * TopupNet provider — exact port of Laravel FreeFire.php.
 *
 * Three delivery modes:
 *   - placeOrder()            : single UniPin auto-voucher order
 *   - placeOrderViaShell()    : shell-based topup (needs provider_product_id)
 *   - placeComboVoucherOrder(): combo sub-item, orderid = "{orderId}-{itemIndex}"
 *
 * All hit  POST {base}/order?key={apiKey}  and expect { status: 'success' }.
 */

type AutoVoucherLike = { id: number; code: string } | null;

async function conf() {
  const s = await gs();
  const apiKey = s.str('free_fire_server_api_key') || env.TOPUPNET_API_KEY || '';
  const baseUrl = (
    s.str('free_fire_server_url') ||
    env.TOPUPNET_BASE_URL ||
    'https://api.topupnet.com/api/v1'
  ).replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

function webhookUrl(): string {
  return `${env.APP_URL.replace(/\/+$/, '')}/api/webhook/auto-topup`;
}

async function postOrder(baseUrl: string, apiKey: string, payload: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/order?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Single UniPin voucher order. `pacakge` (sic — the provider's spelling) is
 * only sent when the variation has a provider_product_id; otherwise TopupNet
 * auto-detects from the voucher. On failure the voucher is rolled back.
 */
export async function placeOrder(order: any, autoVoucher: AutoVoucherLike): Promise<void> {
  try {
    if (autoVoucher) {
      await placeOrderViaUniPin(order, autoVoucher);
    } else if (order.product?.shellId != null) {
      await placeOrderViaShell(order);
    } else {
      logger.warn(`⚠️ No voucher and no shell for order ${order.id}`);
    }
  } catch (e) {
    logger.error(`❌ TopupNet placeOrder error (order ${order.id}): ${(e as Error).message}`);
  }
}

async function placeOrderViaUniPin(order: any, autoVoucher: { id: number; code: string }) {
  const { apiKey, baseUrl } = await conf();
  const code = Array.isArray(autoVoucher.code) ? autoVoucher.code[0] : autoVoucher.code;
  const playerId = order.accountInfo?.player_id ?? '';

  const payload: Record<string, unknown> = {
    orderid: String(order.id),
    playerid: String(playerId),
    code,
    url: webhookUrl(),
  };
  const pkg = order.variation?.providerProductId ?? null;
  if (pkg) payload.pacakge = String(pkg);

  logger.info(`📤 TopupNet UniPin order ${order.id} (pkg: ${pkg ?? 'auto-detect'})`);

  try {
    const { ok, data } = await postOrder(baseUrl, apiKey, payload);
    if (!ok || data?.status !== 'success') {
      logger.error(`❌ TopupNet failed order ${order.id} — rolling back voucher`);
      await rollbackVoucher(order, autoVoucher.id);
    }
  } catch (e) {
    logger.error(`❌ TopupNet UniPin exception order ${order.id}: ${(e as Error).message}`);
    await rollbackVoucher(order, autoVoucher.id);
  }
}

/** Shell topup — provider_product_id is mandatory here. */
export async function placeOrderViaShell(order: any): Promise<void> {
  const { apiKey, baseUrl } = await conf();
  const shell = order.product?.shellId
    ? await prisma.shell.findUnique({ where: { id: order.product.shellId } })
    : null;

  if (!shell) {
    logger.error(`❌ Shell not found for order ${order.id}`);
    return;
  }

  const playerId = order.accountInfo?.player_id ?? '';
  const pkg = order.variation?.providerProductId ?? '';
  if (!pkg) {
    logger.error(`❌ Shell topup: provider_product_id missing (order ${order.id})`);
    return;
  }

  const payload = {
    orderid: String(order.id),
    playerid: String(playerId),
    pacakge: String(pkg),
    code: 'shell',
    url: webhookUrl(),
    username: shell.username,
    password: shell.password,
    autocode: shell.autocode,
  };

  logger.info(`📤 TopupNet Shell order ${order.id} (${shell.name})`);
  try {
    const { ok, data } = await postOrder(baseUrl, apiKey, payload);
    if (!ok || data?.status !== 'success') {
      logger.error(`❌ TopupNet Shell failed order ${order.id}: ${JSON.stringify(data)}`);
    }
  } catch (e) {
    logger.error(`❌ TopupNet Shell exception order ${order.id}: ${(e as Error).message}`);
  }
}

/**
 * Combo sub-item order. orderid encodes the item index so the webhook can
 * route the response back to the right ComboOrderItem. No `pacakge` — TopupNet
 * auto-detects the product from the voucher code.
 */
export async function placeComboVoucherOrder(
  order: any,
  code: string,
  itemIndex: number,
): Promise<{ ok: boolean; data: any }> {
  const { apiKey, baseUrl } = await conf();
  const playerId = order.accountInfo?.player_id ?? '';

  const payload = {
    orderid: `${order.id}-${itemIndex}`,
    playerid: String(playerId),
    code: Array.isArray(code) ? code[0] : code,
    url: webhookUrl(),
  };

  logger.info(`📤 TopupNet Combo order ${order.id}-${itemIndex}`);
  try {
    const { ok, data } = await postOrder(baseUrl, apiKey, payload);
    if (!ok || data?.status !== 'success') {
      logger.error(`❌ Combo topup failed ${order.id}-${itemIndex}: ${JSON.stringify(data)}`);
    }
    return { ok: ok && data?.status === 'success', data };
  } catch (e) {
    logger.error(`❌ Combo topup exception ${order.id}-${itemIndex}: ${(e as Error).message}`);
    return { ok: false, data: null };
  }
}

/** Undo an auto-voucher assignment and bump the order back to processing. */
async function rollbackVoucher(order: any, autoVoucherId: number): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.autoVoucher.update({
        where: { id: autoVoucherId },
        data: { status: 'available', orderId: null },
      }),
      prisma.variation.update({
        where: { id: order.variationId },
        data: { stock: { increment: 1 } },
      }),
      prisma.order.update({ where: { id: order.id }, data: { status: 'processing' } }),
    ]);
    logger.warn(`⚠️ Voucher ${autoVoucherId} rolled back (order ${order.id})`);
  } catch (e) {
    logger.error(`❌ Rollback error: ${(e as Error).message}`);
  }
}
