import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * ucbot.net provider — Free Fire / Garena top-up via https://ucapi.ucbot.net.
 *
 * UNLIKE topupnet & pinbot, ucbot is SYNCHRONOUS: the delivery result comes
 * back in the HTTP response body, there is NO webhook. So the caller
 * (order.service) completes or refunds the order inline — same shape as the
 * auto-LIKE path, not the topup-webhook path. That's why this provider returns
 * a rich `UcbotResult` the caller acts on, instead of the void/ack surface
 * topupnet.provider / pinbot.provider expose.
 *
 * Auth: `Authorization: ucapi_xxxx` header on every request (the key already
 * carries its `ucapi_` prefix — sent verbatim, like pinbot's Authorization).
 *
 * Three flows:
 *   - topupToUid(order) → POST /api/topup  (global UID top-up)
 *   - indoTopup(order)  → POST /api/indo   (Indonesia Garena)
 *   - buyUcCodes(order) → POST /api/uc     (UC redemption codes, no UID)
 *
 * Response shapes (doc):
 *   /api/topup  UC item → { status, batch:[{uc,ok,detail}], success, failed, total, duration }
 *               shell   → { status, success_count, fail_count, report:[...] }  (no batch)
 *   /api/indo           → { status, success_count, fail_count, report:[...] }
 *   /api/uc             → { status, uc_list:[...], total_cost, ... }
 *   error               → { status:'error', error:'...', stock_out?:true }
 */

export type UcbotResult = {
  ok: boolean;
  delivered: number;
  failed: number;
  codes?: string[];
  message: string;
  raw: any;
};

async function conf() {
  const s = await gs();
  // পেস্টে ভুলে স্পেস এলে auth fail করত — তাই trim। base URL এর শেষ / বাদ।
  const apiKey = (s.str('ucbot_api_key') || env.UCBOT_API_KEY || '').trim();
  const baseUrl = (s.str('ucbot_base_url') || env.UCBOT_BASE_URL || 'https://ucapi.ucbot.net')
    .trim()
    .replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

/**
 * ব্যর্থতার কারণটা ক্ষণস্থায়ী (রিট্রাই করলে ঠিক হতে পারে) নাকি ব্যবসায়িক
 * (রিট্রাই অর্থহীন — এখনই refund)। ক্ষণস্থায়ী হলে true → provider throw করবে,
 * worker রিট্রাই করে শেষে refund করবে।
 */
function isTransient(status: number, errText: string): boolean {
  if (status === 429 || status >= 500) return true;
  return /did not respond|timeout|timed out|try again|temporarily|too many/i.test(errText);
}

/**
 * POST JSON with a long timeout (doc: 120s) + short backoff on transport error.
 * NB: never log the API key.
 */
async function postJson(
  path: string,
  payload: Record<string, unknown>,
  attempts = 2,
): Promise<{ status: number; data: any }> {
  const { apiKey, baseUrl } = await conf();
  if (!apiKey) {
    logger.error('❌ UCBot: api key নেই (setting `ucbot_api_key` / env UCBOT_API_KEY)');
    throw new Error('UCBot API key is not configured.');
  }
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      return { status: res.status, data };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

/** অর্ডার থেকে সাধারণ ফিল্ডগুলো বের করি (item কোড, qty, uid, orderid)। */
function orderFields(order: any) {
  const item = String(order.variation?.providerProductId ?? '').trim();
  const qty = Math.max(1, Number(order.quantity) || 1);
  const uid = String(order.accountInfo?.player_id ?? '').trim();
  const orderid = String(order.id);
  return { item, qty, uid, orderid };
}

/**
 * error রেসপন্সকে UcbotResult এ রূপ দিই — ক্ষণস্থায়ী হলে throw (worker রিট্রাই),
 * নইলে ok:false (caller এখনই cancel+refund করবে)।
 */
function handleError(path: string, orderId: number, status: number, data: any): never | UcbotResult {
  const errText = String(data?.error ?? data?.message ?? '').trim() || `HTTP ${status}`;
  if (isTransient(status, errText)) {
    throw new Error(`UCBot ${path} transient (order ${orderId}, status ${status}): ${errText}`);
  }
  logger.warn(`⚠️ UCBot ${path} business failure (order ${orderId}): ${errText}`);
  return { ok: false, delivered: 0, failed: 0, message: errText, raw: data };
}

/** success/error ছাড়া অন্য কিছু এলে সেটা অস্বাভাবিক — throw (worker রিট্রাই)। */
function assertKnown(path: string, orderId: number, status: number, data: any) {
  const st = String(data?.status ?? '').toLowerCase();
  if (st !== 'success' && st !== 'error') {
    throw new Error(
      `UCBot ${path} unexpected response (order ${orderId}, status ${status}): ${JSON.stringify(data)}`,
    );
  }
}

/**
 * report[]/success_count শেপ পার্স করি (shell topup ও /api/indo একই শেপ)।
 * report এর প্রতিটা এন্ট্রি থেকে detail টেনে একটা পাঠযোগ্য বার্তা বানাই।
 */
function parseReport(data: any): { delivered: number; failed: number; message: string } {
  const delivered = Number(data?.success_count ?? 0) || 0;
  const failed = Number(data?.fail_count ?? 0) || 0;
  const report = Array.isArray(data?.report) ? data.report : [];
  const details = report
    .map((r: any) => String(r?.detail ?? r?.message ?? '').replace(/[✅❌]/g, '').trim())
    .filter(Boolean);
  const message =
    details.length > 0
      ? details.join(' | ')
      : `${delivered} delivered, ${failed} failed`;
  return { delivered, failed, message };
}

// ---------------------------------------------------------------------------
// /api/topup — global UID top-up (UC item → batch[], shell item → report[])
// ---------------------------------------------------------------------------
export async function topupToUid(order: any): Promise<UcbotResult> {
  const { item, qty, uid, orderid } = orderFields(order);
  if (!uid) throw new Error(`UCBot topup: player UID missing (order ${order.id})`);
  if (!item) throw new Error(`UCBot topup: provider_product_id missing (order ${order.id})`);

  logger.info(`📤 UCBot /api/topup order ${order.id} (uid ${uid}, item ${item}×${qty})`);
  const { status, data } = await postJson('/api/topup', { uid, item, qty, orderid });
  logger.info(`📥 UCBot /api/topup order ${order.id}: ${JSON.stringify(data)}`);

  assertKnown('/api/topup', order.id, status, data);
  if (String(data?.status).toLowerCase() === 'error') {
    return handleError('/api/topup', order.id, status, data);
  }

  // UC order → batch[]; shell order → report[]/success_count (no batch).
  if (Array.isArray(data?.batch)) {
    const batch = data.batch as Array<{ uc?: any; ok?: boolean; detail?: string }>;
    const delivered = batch.filter((b) => b.ok).length;
    const failed = batch.length - delivered;
    const details = batch
      .map((b) => String(b?.detail ?? '').replace(/[✅❌]/g, '').trim())
      .filter(Boolean);
    const message = details.length ? details.join(' | ') : `${delivered}/${batch.length} UC delivered`;
    return { ok: delivered > 0, delivered, failed, message, raw: data };
  }

  const { delivered, failed, message } = parseReport(data);
  return { ok: delivered > 0, delivered, failed, message, raw: data };
}

// ---------------------------------------------------------------------------
// /api/indo — Indonesia Garena top-up (report[]/success_count shape)
// ---------------------------------------------------------------------------
export async function indoTopup(order: any): Promise<UcbotResult> {
  const { item, qty, uid, orderid } = orderFields(order);
  if (!uid) throw new Error(`UCBot indo: player UID missing (order ${order.id})`);
  if (!item) throw new Error(`UCBot indo: provider_product_id missing (order ${order.id})`);

  logger.info(`📤 UCBot /api/indo order ${order.id} (uid ${uid}, item ${item}×${qty})`);
  const { status, data } = await postJson('/api/indo', { uid, item, qty, orderid });
  logger.info(`📥 UCBot /api/indo order ${order.id}: ${JSON.stringify(data)}`);

  assertKnown('/api/indo', order.id, status, data);
  if (String(data?.status).toLowerCase() === 'error') {
    return handleError('/api/indo', order.id, status, data);
  }

  const { delivered, failed, message } = parseReport(data);
  return { ok: delivered > 0, delivered, failed, message, raw: data };
}

// ---------------------------------------------------------------------------
// /api/uc — buy UC redemption codes (no UID); codes returned in uc_list[]
// ---------------------------------------------------------------------------
export async function buyUcCodes(order: any): Promise<UcbotResult> {
  const { item, qty, orderid } = orderFields(order);
  if (!item) throw new Error(`UCBot uc: provider_product_id missing (order ${order.id})`);

  logger.info(`📤 UCBot /api/uc order ${order.id} (item ${item}×${qty})`);
  const { status, data } = await postJson('/api/uc', { item, qty, orderid });
  // uc_list গোপন কোড বহন করে — পুরো বডি লগ করি না, শুধু সংখ্যা/স্ট্যাটাস।
  logger.info(
    `📥 UCBot /api/uc order ${order.id}: status=${data?.status} count=${
      Array.isArray(data?.uc_list) ? data.uc_list.length : 0
    }`,
  );

  assertKnown('/api/uc', order.id, status, data);
  if (String(data?.status).toLowerCase() === 'error') {
    return handleError('/api/uc', order.id, status, data);
  }

  const list = Array.isArray(data?.uc_list) ? data.uc_list : [];
  const codes = list
    .map((x: any) => (typeof x === 'string' ? x : String(x?.code ?? x?.uc ?? '')).trim())
    .filter(Boolean);
  const message = codes.length
    ? `${codes.length} UC code(s) delivered`
    : 'No codes returned';
  return { ok: codes.length > 0, delivered: codes.length, failed: 0, codes, message, raw: data };
}

/** GET /api/balance — auth/base-URL smoke test. { wallet, due, due_limit, due_left } */
export async function getBalance(): Promise<any> {
  const { apiKey, baseUrl } = await conf();
  if (!apiKey) throw new Error('UCBot API key is not configured.');
  const res = await fetch(`${baseUrl}/api/balance`, {
    method: 'GET',
    headers: { Authorization: apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  return res.json().catch(() => ({}));
}
