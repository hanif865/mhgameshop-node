import { prisma } from '../config/database';
import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { parsePackage } from './pinbot.provider';

/**
 * Nexa provider (api.teamnexa.shop) — async Garena Shell / diamond top-up.
 *
 * Same async surface as pinbot.provider.ts / topupnet.provider.ts, so the three
 * are interchangeable through providers/topup.ts. Chosen shape (confirmed with
 * the owner): ASYNC — POST {base}/topup returns { status: 'processing' } and
 * Nexa POSTs the final result to `url` (our shared /api/webhook/auto-topup);
 * and SHELL / diamond top-up only (Nexa tops up a player UID from its own
 * Garena shell backend — it is not a code-seller).
 *
 * Key differences from pinbot's shell path:
 *   - the shop / region code comes from variation.provider
 *     (shell | sgshell | indoshell | myshell), NOT a local Shell account prefix;
 *   - NO Garena username/password/autocode is sent — Nexa uses its own backend.
 *
 * Auth:     Authorization: <key>   (sent verbatim, like pinbot)
 * Callback: { status, orderid, nickname, content: { batch: [...] } }
 *           status success | failed | partial | completed
 *           (`completed` is normalised to success in routes/webhook.ts).
 */

type AutoVoucherLike = { id: number; code: string } | null;

async function conf() {
  const s = await gs();
  // পেস্টে স্পেস এলে auth fail করত — তাই trim। base URL এর শেষ / বাদ।
  const apiKey = (s.str('nexa_api_key') || env.NEXA_API_KEY || '').trim();
  const baseUrl = (s.str('nexa_base_url') || env.NEXA_BASE_URL || 'https://api.teamnexa.shop')
    .trim()
    .replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

function webhookUrl(): string {
  return `${env.APP_URL.replace(/\/+$/, '')}/api/webhook/auto-topup`;
}

/** Nexa accepts asynchronously — anything but an outright error means queued. */
function accepted(ok: boolean, data: any): boolean {
  if (!ok) return false;
  const s = String(data?.status ?? '').toLowerCase();
  return s === '' || /success|accepted|pending|processing|queued/.test(s);
}

async function postTopup(payload: Record<string, unknown>) {
  const { apiKey, baseUrl } = await conf();
  if (!apiKey) {
    logger.error('❌ Nexa: api key নেই (setting `nexa_api_key` / env NEXA_API_KEY)');
    return { ok: false, status: 0, data: null };
  }
  const res = await fetch(`${baseUrl}/topup`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Entry point — mirrors pinbot.provider.placeOrder
// ---------------------------------------------------------------------------
export async function placeOrder(order: any, autoVoucher: AutoVoucherLike): Promise<void> {
  // এরর গিলে ফেলা যাবে না — worker রিট্রাই ও রিফান্ড ওটার উপর ভরসা করে
  if (autoVoucher) {
    // scope = shell topup; তবু কোনো ভেরিয়েশনে ভুল করে অটো-ভাউচার রিজার্ভ হয়ে
    // গেলে সেটা যেন হারিয়ে না যায় — Nexa UniPin দিয়ে রিডিম করি (একই /topup)।
    return placeOrderViaUniPin(order, autoVoucher);
  }
  // শেল অর্ডার চেনা যায় প্যাকেজ কোড দিয়ে
  if (order.variation?.providerProductId) {
    return placeOrderViaShell(order);
  }
  logger.error(`❌ Nexa: ভাউচারও নেই, প্যাকেজ কোডও নেই (order ${order.id})`);
  throw new Error('এই প্যাকেজে প্রোভাইডার কোড বসানো নেই।');
}

/** Shell / diamond top-up — `code` is the shop/region, providerProductId the package. */
export async function placeOrderViaShell(order: any): Promise<void> {
  const raw = order.variation?.providerProductId ?? '';
  if (!raw) {
    logger.error(`❌ Nexa shell: provider_product_id missing (order ${order.id})`);
    throw new Error('এই প্যাকেজে প্রোভাইডার কোড বসানো নেই।');
  }
  const playerId = String(order.accountInfo?.player_id ?? '').trim();
  if (!playerId) {
    logger.error(`❌ Nexa shell: player UID missing (order ${order.id})`);
    throw new Error('Nexa shell: player UID missing.');
  }

  // "Lite*2" = একই প্যাকেজ ২ বার; শুধু "Lite" হলে ১ বার।
  const { pkg, packQty } = parsePackage(raw);
  // শপ/রিজিয়ন কোড ভেরিয়েশনের provider ফিল্ড থেকে; খালি হলে ডিফল্ট shell (BD)।
  const shopCode = String(order.variation?.provider || 'shell').trim().toLowerCase();
  const qty = packQty * Math.max(1, Number(order.quantity) || 1);

  const payload = {
    orderid: String(order.id),
    playerid: playerId,
    code: shopCode,
    package: pkg,
    qty,
    url: webhookUrl(),
  };

  // shopCode/package গোপন নয় — নিরাপদে লগ করা যায় (Garena ক্রেডেনশিয়াল পাঠাই না)।
  logger.info(`📤 Nexa shell order ${order.id} → ${JSON.stringify(payload)}`);
  // ব্যর্থ হলে throw — worker রিট্রাই করবে, শেষে ক্যান্সেল ও রিফান্ড
  const { ok, data } = await postTopup(payload);
  if (!accepted(ok, data)) {
    logger.error(`❌ Nexa shell failed order ${order.id}: ${JSON.stringify(data)}`);
    throw new Error(`Nexa: ${JSON.stringify(data)}`);
  }
}

async function placeOrderViaUniPin(order: any, autoVoucher: { id: number; code: string }) {
  const code = Array.isArray(autoVoucher.code) ? autoVoucher.code[0] : autoVoucher.code;
  const payload = {
    orderid: String(order.id),
    playerid: String(order.accountInfo?.player_id ?? ''),
    code, // ভাউচার কোড — লগে দেখাই না
    url: webhookUrl(),
  };

  logger.info(`📤 Nexa voucher order ${order.id}`);
  try {
    const { ok, data } = await postTopup(payload);
    if (!accepted(ok, data)) {
      logger.error(`❌ Nexa rejected order ${order.id}: ${JSON.stringify(data)} — rolling back voucher`);
      await rollbackVoucher(order, autoVoucher.id);
    }
  } catch (e) {
    logger.error(`❌ Nexa voucher exception order ${order.id}: ${(e as Error).message}`);
    await rollbackVoucher(order, autoVoucher.id);
  }
}

/** Combo sub-item — orderid encodes the item index for the webhook. */
export async function placeComboVoucherOrder(
  order: any,
  code: string,
  itemIndex: number,
): Promise<{ ok: boolean; data: any }> {
  const payload = {
    orderid: `${order.id}-${itemIndex}`,
    playerid: String(order.accountInfo?.player_id ?? ''),
    code: Array.isArray(code) ? code[0] : code,
    url: webhookUrl(),
  };

  logger.info(`📤 Nexa combo order ${order.id}-${itemIndex}`);
  try {
    const { ok, data } = await postTopup(payload);
    const good = accepted(ok, data);
    if (!good) logger.error(`❌ Nexa combo failed ${order.id}-${itemIndex}: ${JSON.stringify(data)}`);
    return { ok: good, data };
  } catch (e) {
    logger.error(`❌ Nexa combo exception ${order.id}-${itemIndex}: ${(e as Error).message}`);
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
