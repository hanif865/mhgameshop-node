import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { placePoolOrder } from '../providers/pinbot.provider';
import { emitOrderStatus } from '../realtime';

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
