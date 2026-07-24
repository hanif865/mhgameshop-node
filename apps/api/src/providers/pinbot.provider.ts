import { prisma } from '../config/database';
import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * PinBot provider — same surface as topupnet.provider.ts so the two are
 * interchangeable through providers/topup.ts.
 *
 * Differences from TopupNet:
 *   - auth:     Authorization: <key>   (TopupNet puts the key in the query)
 *   - endpoint: POST {base}/topup      (TopupNet: /order)
 *   - voucher:  no `package` field — the voucher itself decides the product
 *   - shell:    `code` is the REGION (shell | sgshell | myshell | indoshell),
 *               plus `qty`; no shell_balance / tgbotid
 *   - ack:      { status: 'processing' | 'accepted' | ... }
 *   - callback: { status, orderid, nickname, content: { batch: [...] } }
 *               (flattened to a plain string in routes/webhook.ts)
 */

type AutoVoucherLike = { id: number; code: string } | null;

async function conf() {
  const s = await gs();
  const apiKey = s.str('pinbot_api_key') || process.env.PINBOT_API_KEY || '';
  const baseUrl = (
    s.str('pinbot_base_url') ||
    process.env.PINBOT_BASE_URL ||
    'https://api.pinbot.shop'
  ).replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

function webhookUrl(): string {
  return `${env.APP_URL.replace(/\/+$/, '')}/api/webhook/auto-topup`;
}

/** PinBot accepts asynchronously — anything but an outright error means queued. */
function accepted(ok: boolean, data: any): boolean {
  if (!ok) return false;
  const s = String(data?.status ?? '').toLowerCase();
  return s === '' || /success|accepted|pending|processing|queued/.test(s);
}

/** লগে দেখানোর আগে গোপন ফিল্ড ঢেকে দিই — পাসওয়ার্ড/2FA যেন না ফাঁস হয়। */
function maskBody(p: Record<string, unknown>) {
  const hide = (v: unknown) => (v ? '••••' : v);
  return { ...p, password: hide(p.password), autocode: hide(p.autocode) };
}

async function postTopup(payload: Record<string, unknown>) {
  const { apiKey, baseUrl } = await conf();
  if (!apiKey) {
    logger.error('❌ PinBot: api key is not configured (setting `pinbot_api_key`)');
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
// Entry point — mirrors topupnet.provider.placeOrder
// ---------------------------------------------------------------------------
export async function placeOrder(order: any, autoVoucher: AutoVoucherLike): Promise<void> {
  // এরর গিলে ফেলা যাবে না — worker রিট্রাই ও রিফান্ড করে ওটার উপর ভরসা করে
  if (autoVoucher) {
    return placeOrderViaUniPin(order, autoVoucher);
  }
  // শেল অর্ডার চেনা যায় প্যাকেজ কোড দিয়ে; অ্যাকাউন্ট বাছে pickShell
  if (order.variation?.providerProductId) {
    return placeOrderViaShell(order);
  }
  logger.error(`❌ ভাউচারও নেই, প্যাকেজ কোডও নেই (order ${order.id})`);
  throw new Error('এই প্যাকেজে প্রোভাইডার কোড বসানো নেই।');
}

async function placeOrderViaUniPin(order: any, autoVoucher: { id: number; code: string }) {
  const code = Array.isArray(autoVoucher.code) ? autoVoucher.code[0] : autoVoucher.code;
  const playerId = order.accountInfo?.player_id ?? '';

  // No `package`: PinBot derives the product from the voucher itself.
  const payload = {
    orderid: String(order.id),
    playerid: String(playerId),
    code,
    url: webhookUrl(),
  };

  logger.info(`📤 PinBot voucher order ${order.id}`);
  try {
    const { ok, data } = await postTopup(payload);
    if (!accepted(ok, data)) {
      logger.error(`❌ PinBot rejected order ${order.id}: ${JSON.stringify(data)} — rolling back voucher`);
      await rollbackVoucher(order, autoVoucher.id);
    }
  } catch (e) {
    logger.error(`❌ PinBot voucher exception order ${order.id}: ${(e as Error).message}`);
    await rollbackVoucher(order, autoVoucher.id);
  }
}

/**
 * UC-pool order: several voucher codes in ONE request, comma-separated.
 * PinBot accepts up to 5 per call — the caller batches, `suffix` keeps each
 * batch's orderid unique ("101-b2") so callbacks stay distinguishable.
 */
export async function placePoolOrder(
  order: any,
  codes: string[],
  suffix = '',
): Promise<{ ok: boolean; data: any }> {
  const payload = {
    orderid: `${order.id}${suffix}`,
    playerid: String(order.accountInfo?.player_id ?? ''),
    code: codes.join(','),
    url: webhookUrl(),
  };

  logger.info(`📤 PinBot pool order ${order.id}${suffix} — ${codes.length} code(s)`);
  try {
    const { ok, data } = await postTopup(payload);
    const good = accepted(ok, data);
    if (!good) logger.error(`❌ PinBot pool failed ${order.id}${suffix}: ${JSON.stringify(data)}`);
    return { ok: good, data };
  } catch (e) {
    logger.error(`❌ PinBot pool exception ${order.id}${suffix}: ${(e as Error).message}`);
    return { ok: false, data: null };
  }
}

/**
 * provider_product_id → PinBot package + how many of it.
 * "lvl6" → 1× lvl6 ; "Lite*2" → 2× Lite.
 */
export function parsePackage(raw: string): { pkg: string; packQty: number } {
  const m = String(raw).trim().match(/^(.+?)\s*[*x×]\s*(\d+)$/i);
  return m ? { pkg: m[1].trim(), packQty: Math.max(1, Number(m[2])) } : { pkg: String(raw).trim(), packQty: 1 };
}

/**
 * এই অর্ডারটা কোন শেল অ্যাকাউন্ট দিয়ে যাবে।
 * প্রোডাক্টে নির্দিষ্ট করে বাঁধা থাকলে সেটাই; নইলে যেটা চালু আছে সেটা।
 * ফলে অ্যাকাউন্ট বদলালে প্রতিটা প্রোডাক্ট আলাদা করে বদলাতে হয় না।
 */
export async function pickShell(order: any) {
  if (order.product?.shellId) {
    const bound = await prisma.shell.findUnique({ where: { id: order.product.shellId } });
    if (bound && bound.status === 1) return bound;
  }
  return prisma.shell.findFirst({ where: { status: 1 }, orderBy: { id: 'asc' } });
}

/** Shell topup — `code` carries the region, provider_product_id the package. */
export async function placeOrderViaShell(order: any): Promise<void> {
  const shell = await pickShell(order);

  if (!shell) {
    logger.error(`❌ কোনো চালু শেল অ্যাকাউন্ট নেই (order ${order.id})`);
    throw new Error('কোনো চালু শেল অ্যাকাউন্ট নেই।');
  }

  const raw = order.variation?.providerProductId ?? '';
  if (!raw) {
    logger.error(`❌ PinBot shell: provider_product_id missing (order ${order.id})`);
    throw new Error('এই প্যাকেজে প্রোভাইডার কোড বসানো নেই।');
  }

  // "Lite*2" = একই প্যাকেজ ২ বার। শুধু "Lite" হলে ১ বার।
  // এতে "2x Weekly Lite" ধরনের প্যাকেজ আলাদা করে বানানো যায়।
  const { pkg, packQty } = parsePackage(raw);

  const region = shell.prefix || process.env.SHELL_CODE || 'shell';
  const qty = packQty * Math.max(1, Number(order.quantity) || 1);
  const payload = {
    orderid: String(order.id),
    playerid: String(order.accountInfo?.player_id ?? ''),
    code: region,
    package: pkg,
    qty,
    username: shell.username,
    password: shell.password,
    autocode: shell.autocode ?? '',
    url: webhookUrl(),
  };

  // qty লগে দেখাই যাতে "কতবার রিডিম গেল" যাচাই করা যায়
  logger.info(
    `📤 PinBot shell order ${order.id} → ${JSON.stringify(maskBody(payload))}`,
  );
  // ব্যর্থ হলে throw — worker রিট্রাই করবে, শেষে ক্যান্সেল ও রিফান্ড
  const { ok, data } = await postTopup(payload);
  if (!accepted(ok, data)) {
    logger.error(`❌ PinBot shell failed order ${order.id}: ${JSON.stringify(data)}`);
    throw new Error(`PinBot: ${JSON.stringify(data)}`);
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

  logger.info(`📤 PinBot combo order ${order.id}-${itemIndex}`);
  try {
    const { ok, data } = await postTopup(payload);
    const good = accepted(ok, data);
    if (!good) logger.error(`❌ PinBot combo failed ${order.id}-${itemIndex}: ${JSON.stringify(data)}`);
    return { ok: good, data };
  } catch (e) {
    logger.error(`❌ PinBot combo exception ${order.id}-${itemIndex}: ${(e as Error).message}`);
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
