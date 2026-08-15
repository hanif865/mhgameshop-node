import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { placePoolOrder } from '../providers/pinbot.provider';
import { emitOrderStatus } from '../realtime';
import { gs } from '../utils/settings';
import { notifyUser } from './notification.service';

/**
 * UC voucher pool fulfilment.
 *
 * A pack declares a recipe in `pack_recipes` ("this pack needs 2× 160 UC and
 * 1× 80 UC"). At order time we reserve exactly those codes from the shared
 * `voucher_pool` and either hand them to the provider (top-up) or straight to
 * the customer (voucher sale) — up to 5 codes per request, comma-separated,
 * which is PinBot's batch limit.
 *
 * A pack is either a `variation` or a `combo_package`; `pack_recipes` carries
 * exactly one of the two ids. Both are addressed here through `PackRef`.
 *
 * Tables are raw SQL (not in schema.prisma) so no Prisma migration is needed.
 */

const BATCH = 5; // PinBot: max codes per request

/**
 * ভাউচার কোডের সিরিয়াল লেটার → UC ডিনোমিনেশন।
 * কোড এমন: "BDMB-T-S-01234567 1111-2222-3333-4444" — এখানে "BDMB-T" থেকেই
 * বোঝা যায় এটা 20 UC। এতে কোড যোগের সময় হাতে UC লিখতে হয় না।
 */
const UC_BY_SERIAL: Record<string, number> = {
  'BDMB-T': 20, 'UPBD-Q': 20,
  'BDMB-U': 36, 'UPBD-R': 36,
  'BDMB-J': 80, 'UPBD-G': 80,
  'BDMB-I': 160, 'UPBD-F': 160,
  'BDMB-Q': 161, 'UPBD-N': 161,
  'BDMB-R': 162, 'UPBD-O': 162,
  'BDMB-K': 405, 'UPBD-H': 405,
  'BDMB-S': 800, 'UPBD-P': 800,
  'BDMB-L': 810, 'UPBD-I': 810,
  'BDMB-M': 1625, 'UPBD-J': 1625,
  'UPBD-7': 2000,
};

/**
 * ভাউচার কোডের চেহারা: সিরিয়াল (UPBD-P-S-03815763) + ঐচ্ছিক PIN
 * (3479-1391-3717-2523)। g-ফ্ল্যাগ দিয়ে লেখার ভেতর থেকে সবগুলো খুঁজি।
 */
const CODE_GLOBAL = /[A-Z]{4}-[A-Z0-9]-[A-Z]-\d{4,}(?:\s+\d{3,6}(?:-\d{3,6}){1,5})?/gi;

/**
 * যেকোনো লেখা থেকে সব ভাউচার কোড আলাদা করে বের করে।
 *
 * লাইন ধরে ধরে না পড়ে পুরো লেখায় প্যাটার্ন খোঁজে, তাই:
 *  • এক লাইনে একাধিক কোড পেস্ট করলেও আলাদা হয়ে যায়
 *  • দাম/ব্যালান্সের নোট লাইন এমনিতেই বাদ পড়ে (প্যাটার্নে মেলে না)
 *  • একই কোড দুবার থাকলে একবারই থাকে
 */
export function extractCodes(text: string): string[] {
  const seen = new Set<string>();
  for (const m of String(text ?? '').matchAll(CODE_GLOBAL)) {
    const code = m[0].replace(/\s+/g, ' ').trim().toUpperCase();
    seen.add(code);
  }
  return [...seen];
}

/** কোড থেকে UC শনাক্ত করে; প্যাটার্নে না মিললে null। */
export function detectUc(code: string): number | null {
  const m = String(code).trim().match(/^([A-Z]{4})-([A-Z0-9])-S-/i);
  if (!m) return null;
  return UC_BY_SERIAL[`${m[1].toUpperCase()}-${m[2].toUpperCase()}`] ?? null;
}

type Recipe = { uc: number; qty: number };
type PoolRow = { id: number; code: string };

/** Which pack an order is for — a variation or a combo package. */
export type PackRef = { variationId: number; comboId?: null } | { variationId?: null; comboId: number };

/** Read the pack an order points at. Combo wins: combo orders leave variationId null. */
export function packOf(order: { variationId?: number | null; comboPackageId?: number | null }): PackRef | null {
  if (order.comboPackageId) return { comboId: order.comboPackageId };
  if (order.variationId) return { variationId: order.variationId };
  return null;
}

export async function getRecipe(ref: PackRef): Promise<Recipe[]> {
  return ref.comboId
    ? prisma.$queryRaw<Recipe[]>`
        SELECT uc, qty FROM pack_recipes WHERE combo_package_id = ${ref.comboId} ORDER BY uc DESC`
    : prisma.$queryRaw<Recipe[]>`
        SELECT uc, qty FROM pack_recipes WHERE variation_id = ${ref.variationId} ORDER BY uc DESC`;
}

/** How many of this pack the pool can currently cover. */
export async function poolStockFor(ref: PackRef): Promise<number | null> {
  const recipe = await getRecipe(ref);
  if (!recipe.length) return null; // not a pool-backed pack
  let possible = Infinity;
  for (const r of recipe) {
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM voucher_pool WHERE uc = ${r.uc} AND status = 'available'`;
    possible = Math.min(possible, Math.floor(Number(n) / r.qty));
  }
  return possible === Infinity ? 0 : possible;
}

/**
 * For a pool-backed pack, make its `stock` column mirror what the pool can
 * actually cover. The website gates orders on that field, so without this a
 * pack with 20 codes in the pool would still show (and sell) only its old
 * hand-typed stock.
 */
export async function syncPackStock(ref: PackRef): Promise<number | null> {
  const n = await poolStockFor(ref);
  if (n === null) return null; // not pool-backed — leave the manual stock alone
  if (ref.comboId) {
    await prisma.comboPackage.update({ where: { id: ref.comboId }, data: { stock: n } });
  } else {
    await prisma.variation.update({ where: { id: ref.variationId! }, data: { stock: n } });
  }
  return n;
}

/**
 * একটা অর্ডারে যেসব UC খরচ (বা ফেরত) হল, সেগুলো ব্যবহার করে এমন
 * *সব* প্যাকেজের স্টক মেলায় — শুধু যেটা অর্ডার হয়েছে সেটা নয়।
 * নইলে একই UC ভাগ করা অন্য প্যাকেজগুলো পুরনো (বেশি) স্টক দেখাত,
 * আর কাস্টমার এমন কিছু অর্ডার করতে পারত যা পুল কভার করে না।
 */
export async function syncAfterPoolChange(recipe: Recipe[]): Promise<void> {
  for (const r of recipe) await syncPacksForUc(r.uc).catch(() => null);
}

/** Re-sync every pool-backed pack that uses this denomination. */
export async function syncPacksForUc(uc: number): Promise<void> {
  const rows = await prisma.$queryRaw<{ variation_id: number | null; combo_package_id: number | null }[]>`
    SELECT DISTINCT variation_id, combo_package_id FROM pack_recipes WHERE uc = ${uc}`;
  for (const r of rows) {
    const ref: PackRef = r.combo_package_id ? { comboId: r.combo_package_id } : { variationId: r.variation_id! };
    await syncPackStock(ref).catch(() => null);
  }
}

/**
 * Reserve the codes an order needs. Runs in one transaction with
 * FOR UPDATE SKIP LOCKED so two concurrent orders can never take the same code.
 * Throws if stock is short (nothing is reserved in that case).
 */
async function reserveCodes(orderId: number, recipe: Recipe[], multiplier: number): Promise<PoolRow[]> {
  return prisma.$transaction(async (tx) => {
    const taken: PoolRow[] = [];
    for (const r of recipe) {
      const need = r.qty * multiplier;
      const rows = await tx.$queryRaw<PoolRow[]>`
        SELECT id, code FROM voucher_pool
         WHERE uc = ${r.uc} AND status = 'available'
         ORDER BY id
         LIMIT ${need}
         FOR UPDATE SKIP LOCKED`;
      if (rows.length < need) {
        throw new Error(`স্টক কম: ${r.uc} UC — দরকার ${need}, আছে ${rows.length}`);
      }
      await tx.$executeRaw`
        UPDATE voucher_pool
           SET status = 'sold', order_id = ${orderId}, updated_at = NOW()
         WHERE id = ANY(${rows.map((x) => x.id)}::int[])`;
      taken.push(...rows);
    }
    return taken;
  });
}

/** Put an order's reserved codes back (used when delivery fails). */
export async function restorePoolCodes(orderId: number): Promise<number> {
  // কোন কোন UC ফেরত যাচ্ছে — মুছে ফেলার আগেই জেনে নিই
  const ucs = await prisma.$queryRaw<{ uc: number }[]>`
    SELECT DISTINCT uc FROM voucher_pool WHERE order_id = ${orderId} AND status = 'sold'`;

  const res = await prisma.$executeRaw`
    UPDATE voucher_pool
       SET status = 'available', order_id = NULL, updated_at = NOW()
     WHERE order_id = ${orderId} AND status = 'sold'`;
  if (res > 0) {
    logger.warn(`⚠️ ${res} pool code(s) returned to stock (order ${orderId})`);
    await syncAfterPoolChange(ucs.map((r) => ({ uc: r.uc, qty: 1 })));
  }
  return res;
}

/** Mark individual codes bad (provider said they were already consumed). */
export async function markPoolCodesInvalid(codes: string[]): Promise<void> {
  if (!codes.length) return;
  const rows = await prisma.$queryRaw<{ uc: number }[]>`
    SELECT DISTINCT uc FROM voucher_pool WHERE code = ANY(${codes}::text[])`;
  await prisma.$executeRaw`
    UPDATE voucher_pool SET status = 'invalid', updated_at = NOW() WHERE code = ANY(${codes}::text[])`;
  logger.warn(`⚠️ ${codes.length} pool code(s) marked invalid`);
  // কোড হারিয়ে গেল — দৃশ্যমান স্টকও মিলিয়ে দিই
  for (const r of rows) await syncPacksForUc(r.uc).catch(() => null);
}

/**
 * Voucher SALE from the pool — the customer buys the code itself.
 * No provider call: we just hand the codes over and complete the order.
 * @returns true if handled here.
 */
export async function tryPoolVoucherSale(order: any): Promise<boolean> {
  const ref = packOf(order);
  if (!ref) return false;
  const recipe = await getRecipe(ref);
  if (!recipe.length) return false; // পুরনো Voucher টেবিল থেকেই যাক

  const multiplier = Math.max(1, Number(order.quantity) || 1);
  const codes = await reserveCodes(order.id, recipe, multiplier);

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'completed', voucherCode: codes.map((c) => c.code).join(',') },
  });

  logger.info(`🎫 Pool voucher sale ${order.id}: ${codes.length} code(s) delivered`);
  await syncAfterPoolChange(recipe);
  await emitOrderStatus(order.id);
  return true;
}

/**
 * Try to fulfil a TOP-UP order from the pool (codes go to the provider).
 * @returns true if this order was handled here (caller should stop).
 */
export async function tryPoolTopup(order: any): Promise<boolean> {
  const ref = packOf(order);
  if (!ref) return false;
  const recipe = await getRecipe(ref);
  if (!recipe.length) return false; // not pool-backed — use the old path

  const multiplier = Math.max(1, Number(order.quantity) || 1);

  let codes: PoolRow[];
  try {
    codes = await reserveCodes(order.id, recipe, multiplier);
  } catch (e) {
    logger.error(`❌ Pool reserve failed (order ${order.id}): ${(e as Error).message}`);
    throw e; // worker retries / refunds
  }

  logger.info(
    `📦 Pool order ${order.id}: ${codes.length} code(s) — ` +
      recipe.map((r) => `${r.uc}UC×${r.qty * multiplier}`).join(' + '),
  );

  // এখনো completed নয় — pinbot এর webhook এলে তবেই। নইলে ফেল করলে
  // webhook "already processed" বলে ফিরে যেত, টাকা ফেরত হত না।
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'autoprocessing', voucherCode: codes.map((c) => c.code).join(',') },
  });
  await emitOrderStatus(order.id);

  // Send in batches of 5 (PinBot accepts comma-separated codes).
  for (let i = 0; i < codes.length; i += BATCH) {
    const chunk = codes.slice(i, i + BATCH);
    const suffix = codes.length > BATCH ? `-b${Math.floor(i / BATCH) + 1}` : '';
    const { ok } = await placePoolOrder(order, chunk.map((c) => c.code), suffix);
    if (!ok) logger.error(`❌ Pool batch failed (order ${order.id}${suffix})`);
  }

  // পুল কমেছে — দৃশ্যমান স্টকও মিলিয়ে দিই
  await syncAfterPoolChange(recipe);

  return true;
}

/** consumed / already used জাতীয় detail? */
function isConsumedDetail(detail: string): boolean {
  return /consumed|already\s*(used|redeem)/i.test(String(detail ?? ''));
}

/**
 * অটো-টপআপ ব্যাচের ফলে যেসব কোড "consumed / already used" এসেছে, সেগুলোর
 * বদলে পুল থেকে একই UC-এর নতুন কোড রিজার্ভ করে provider এ আবার পাঠায় (suffix -r1)।
 * রিট্রাই শুধু ১ বার — voucher_replacements এ এই অর্ডারের লগ থাকলে আর নয়।
 *
 * @returns
 *   'retried'   — নতুন কোড পাঠানো হয়েছে (অর্ডার autoprocessing এ রাখুন)
 *   'no_stock'  — রিপ্লেসমেন্ট স্টক নেই (admin দেখবে)
 *   'exhausted' — আগেই রিট্রাই হয়েছে / uc জানা নেই (admin দেখবে)
 *   'none'      — consumed নেই বা পুল-backed নয় (স্বাভাবিক প্রবাহে যান)
 */
export async function retryConsumedPool(
  order: { id: number; userId: number; variationId?: number | null; comboPackageId?: number | null; accountInfo?: any },
  batch: Array<{ ok?: boolean; detail?: string; uc?: number | string }>,
): Promise<'retried' | 'no_stock' | 'exhausted' | 'none'> {
  const consumed = (batch ?? []).filter((b) => !b.ok && isConsumedDetail(String(b.detail ?? '')));
  if (!consumed.length) return 'none';

  const ref = packOf(order);
  const recipe = ref ? await getRecipe(ref) : [];
  if (!recipe.length) return 'none'; // পুল-backed নয় → স্বাভাবিক (cancel+refund)

  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM voucher_replacements WHERE order_id = ${order.id}`;
  if (Number(n) > 0) return 'exhausted'; // ইতিমধ্যে ১ বার রিট্রাই হয়েছে

  // প্রতিটা consumed এর UC — ব্যাচে থাকলে সেটা, নইলে single-uc প্যাকের recipe থেকে
  const ucs: number[] = [];
  for (const c of consumed) {
    const uc = Number(c.uc);
    if (Number.isFinite(uc) && uc > 0) ucs.push(uc);
  }
  if (ucs.length < consumed.length) {
    if (recipe.length === 1) {
      ucs.length = 0;
      for (let i = 0; i < consumed.length; i++) ucs.push(recipe[0].uc);
    } else {
      return 'exhausted'; // কোন UC রিপ্লেস করতে হবে নিশ্চিত নয় — admin দেখবে
    }
  }

  let fresh: string[];
  try {
    fresh = await prisma.$transaction(async (tx) => {
      const out: string[] = [];
      for (const uc of ucs) {
        const [row] = await tx.$queryRaw<{ id: number; code: string }[]>`
          SELECT id, code FROM voucher_pool WHERE uc = ${uc} AND status = 'available'
           ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!row) throw new Error('NO_STOCK');
        await tx.$executeRaw`
          UPDATE voucher_pool SET status = 'sold', order_id = ${order.id}, updated_at = NOW() WHERE id = ${row.id}`;
        await tx.$executeRaw`
          INSERT INTO voucher_replacements (order_id, user_id, old_code, new_code, uc)
          VALUES (${order.id}, ${order.userId}, 'auto-consumed', ${row.code}, ${uc})`;
        out.push(row.code);
      }
      return out;
    });
  } catch (e) {
    if ((e as Error).message === 'NO_STOCK') return 'no_stock';
    throw e;
  }

  await syncAfterPoolChange(ucs.map((uc) => ({ uc, qty: 1 })));
  await placePoolOrder(order, fresh, '-r1');
  logger.warn(`🔄 Auto-retry order ${order.id}: ${fresh.length} replacement code(s) sent (consumed)`);
  return 'retried';
}

/** voucher_replacements টেবিল না থাকলে বানায় (বুট-টাইমে, idempotent)। */
export async function ensureVoucherReplacementsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS voucher_replacements (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      user_id INTEGER,
      old_code TEXT,
      new_code TEXT,
      uc INTEGER,
      created_at TIMESTAMP DEFAULT now()
    )`);
}

/**
 * কাস্টমার একটা ভাউচার কোড "কাজ করছে না / already consumed" রিপোর্ট করলে
 * পুল থেকে একই UC-এর নতুন কোড দিয়ে অটো-রিপ্লেস করে।
 *
 * নিরাপত্তা/অপব্যবহার রোধ:
 *  • কোডটা অবশ্যই এই ইউজারের ঐ অর্ডারে ও পুলে 'sold' হতে হবে
 *  • প্রতি কোড একবারই (রিপ্লেসের পর পুরনোটা 'invalid' → আর নেওয়া যায় না)
 *  • প্রতি ইউজার দৈনিক লিমিট (setting: voucher_replace_daily_limit, ডিফল্ট 3)
 *  • প্রতিটি রিপ্লেস voucher_replacements এ লগ হয়
 */
export async function replaceConsumedVoucher(
  userId: number,
  orderId: number,
  badCode: string,
): Promise<{ old: string; newCode: string }> {
  const code = String(badCode ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!code) throw new Error('কোড দিন।');

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId, status: 'completed' },
    select: { id: true, voucherCode: true },
  });
  if (!order || !order.voucherCode) throw new Error('অর্ডার পাওয়া যায়নি।');

  const codes = order.voucherCode.split(',').map((c) => c.trim());
  const idx = codes.findIndex((c) => c.toUpperCase() === code);
  if (idx === -1) throw new Error('এই কোডটি এই অর্ডারে নেই।');

  const [poolRow] = await prisma.$queryRaw<{ id: number; uc: number; status: string; order_id: number | null }[]>`
    SELECT id, uc, status, order_id FROM voucher_pool WHERE UPPER(code) = ${code} LIMIT 1`;
  if (!poolRow) throw new Error('এই কোডটি পুল থেকে আসেনি — সাপোর্টে যোগাযোগ করুন।');
  if (poolRow.status !== 'sold' || poolRow.order_id !== orderId) {
    throw new Error('এই কোড আগেই রিপ্লেস বা প্রসেস হয়েছে।');
  }

  const s = await gs();
  const limit = s.int('voucher_replace_daily_limit', 3);
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM voucher_replacements
     WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '24 hours'`;
  if (Number(n) >= limit) throw new Error('আজকের রিপ্লেস লিমিট শেষ — সাপোর্টে যোগাযোগ করুন।');

  const noteAppend = ` [replaced: customer reported consumed, order ${orderId}]`;
  const fresh = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: number; code: string }[]>`
      SELECT id, code FROM voucher_pool
       WHERE uc = ${poolRow.uc} AND status = 'available'
       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!row) throw new Error('দুঃখিত, এই মুহূর্তে রিপ্লেসমেন্ট কোড নেই — সাপোর্টে যোগাযোগ করুন।');

    await tx.$executeRaw`
      UPDATE voucher_pool SET status = 'invalid', note = COALESCE(note, '') || ${noteAppend}, updated_at = NOW()
       WHERE id = ${poolRow.id}`;
    await tx.$executeRaw`
      UPDATE voucher_pool SET status = 'sold', order_id = ${orderId}, updated_at = NOW()
       WHERE id = ${row.id}`;

    codes[idx] = row.code;
    await tx.order.update({ where: { id: orderId }, data: { voucherCode: codes.join(',') } });

    await tx.$executeRaw`
      INSERT INTO voucher_replacements (order_id, user_id, old_code, new_code, uc)
      VALUES (${orderId}, ${userId}, ${code}, ${row.code}, ${poolRow.uc})`;
    return row;
  });

  await syncPacksForUc(poolRow.uc).catch(() => null);
  logger.warn(`🔄 Voucher replaced (order ${orderId}, user ${userId}): ${code} → ${fresh.code}`);
  notifyUser(
    userId,
    `🔄 <b>ভাউচার রিপ্লেস</b>

অর্ডার #${orderId} এর একটি কোড বদলে নতুন কোড দেওয়া হয়েছে:
<code>${fresh.code}</code>`,
  ).catch(() => {});

  return { old: code, newCode: fresh.code };
}
