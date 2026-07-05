/**
 * MH Game Shop — legacy MySQL -> PostgreSQL migration.
 *
 * Reads the old Laravel/Filament MySQL database and inserts every row into the
 * new Prisma/PostgreSQL schema, preserving primary keys and relations.
 *
 * It translates the legacy quirks discovered in the real dump:
 *   - users.avator            -> avatar   (legacy typo)
 *   - users.gauth_id          -> googleId
 *   - users.is_reseller       -> role = reseller
 *   - products.content        -> description
 *   - products image          -> spatie `media` table (no image column)
 *   - sliders image           -> spatie `media` table
 *   - vouchers/auto_vouchers  -> status normalized to available/sold
 *   - orders 'auto-processing'-> 'autoprocessing'
 *   - transactions '+' / '-'  -> credit / debit
 *   - deposits unpaid/paid    -> pending/paid, track_id -> transactionId
 *   - spatie settings         -> flat key/value store
 *
 * Combo tables do not exist in the legacy dump, so they are skipped.
 *
 * Usage:  npm run migrate:mysql   (from repo root or packages/database)
 * Env:    MYSQL_HOST/PORT/USER/PASSWORD/DATABASE + DATABASE_URL (postgres)
 *
 * Idempotent: uses createMany({ skipDuplicates }) so it can be re-run.
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toBool = (v: unknown): boolean => v === 1 || v === '1' || v === true;

const toStr = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

const toDate = (v: unknown): Date =>
  v ? new Date(v as string) : new Date();

/** Legacy stock status is a mess ('0','1','available','sold'). An assigned
 *  order_id is the only reliable signal that a code was consumed. */
const normalizeStock = (raw: unknown, orderId: number | null): 'available' | 'sold' => {
  if (orderId) return 'sold';
  const s = String(raw).toLowerCase();
  if (s === 'sold' || s === '0') return 'sold';
  return 'available';
};

const ORDER_STATUS_MAP: Record<string, string> = {
  completed: 'completed',
  processing: 'processing',
  'auto-processing': 'autoprocessing',
  autoprocessing: 'autoprocessing',
  hold: 'hold',
  pending: 'pending',
  cancelled: 'cancelled',
};

function parseAccountInfo(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function insertChunked<T>(
  label: string,
  rows: T[],
  fn: (chunk: T[]) => Promise<unknown>,
  size = 500,
) {
  let done = 0;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    await fn(chunk);
    done += chunk.length;
  }
  console.log(`  ✓ ${label}: ${done} rows`);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'netliverse_mhgs',
    dateStrings: true,
  });

  const q = async <R = any>(sql: string): Promise<R[]> => {
    const [rows] = await conn.query(sql);
    return rows as R[];
  };

  console.log('→ Connected to MySQL. Starting migration...\n');

  // ---- Media lookup (spatie) : model_type#model_id -> "mediaId/file_name" ----
  const media = await q(
    'SELECT id, model_type, model_id, file_name FROM media',
  ).catch(() => [] as any[]);
  const mediaMap = new Map<string, string>();
  for (const m of media) {
    const key = `${m.model_type}#${m.model_id}`;
    if (!mediaMap.has(key)) mediaMap.set(key, `${m.id}/${m.file_name}`);
  }
  const imageFor = (modelClass: string, id: number): string | null =>
    mediaMap.get(`App\\Models\\${modelClass}#${id}`) ?? null;

  // ---- Users ----
  const users = await q('SELECT * FROM users');
  await insertChunked('users', users, (chunk) =>
    prisma.user.createMany({
      skipDuplicates: true,
      data: chunk.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password ?? null,
        googleId: toStr(u.gauth_id),
        googleAvatar: null,
        avatar: toStr(u.avator),
        phone: toStr(u.phone),
        balance: String(u.balance ?? 0),
        role: toBool(u.is_reseller)
          ? 'reseller'
          : u.role === 'admin' || toBool(u.is_admin)
            ? 'admin'
            : 'user',
        status: toInt(u.status) ?? 1,
        createdAt: toDate(u.created_at),
        updatedAt: toDate(u.updated_at),
      })),
    }),
  );

  // ---- Categories ----
  const categories = await q('SELECT * FROM categories');
  await insertChunked('categories', categories, (chunk) =>
    prisma.category.createMany({
      skipDuplicates: true,
      data: chunk.map((c) => ({
        id: c.id,
        title: c.title,
        icon: null,
        orderColumn: toInt(c.order_column) ?? 0,
        status: toInt(c.status) ?? 1,
        createdAt: toDate(c.created_at),
        updatedAt: toDate(c.updated_at),
      })),
    }),
  );

  // ---- Shells (must exist before products FK) ----
  const shells = await q('SELECT * FROM shells').catch(() => [] as any[]);
  await insertChunked('shells', shells, (chunk) =>
    prisma.shell.createMany({
      skipDuplicates: true,
      data: chunk.map((s) => ({
        id: s.id,
        name: s.name,
        username: s.username,
        password: s.password,
        autocode: s.autocode,
        shellbalance: toStr(s.shellbalance),
        tgbotid: toStr(s.tgbotid),
        status: 1,
        createdAt: toDate(s.created_at),
        updatedAt: toDate(s.updated_at),
      })),
    }),
  );

  // ---- Products ----
  const products = await q('SELECT * FROM products');
  await insertChunked('products', products, (chunk) =>
    prisma.product.createMany({
      skipDuplicates: true,
      data: chunk.map((p) => ({
        id: p.id,
        categoryId: toInt(p.category_id) ?? 1,
        title: String(p.title),
        slug: p.slug,
        type: p.type,
        image: imageFor('Product', p.id),
        description: toStr(p.content),
        shellId: toInt(p.shell_id),
        orderColumn: toInt(p.order_column) ?? 0,
        status: toInt(p.status) ?? 1,
        createdAt: toDate(p.created_at),
        updatedAt: toDate(p.updated_at),
      })),
    }),
  );

  // ---- Variations ----
  const variations = await q('SELECT * FROM variations');
  await insertChunked('variations', variations, (chunk) =>
    prisma.variation.createMany({
      skipDuplicates: true,
      data: chunk.map((v) => ({
        id: v.id,
        productId: v.product_id,
        title: v.title,
        price: String(v.price ?? 0),
        buyRate: String(v.buy_rate ?? 0),
        stock: toInt(v.stock) ?? 0,
        provider: toStr(v.provider),
        providerProductId: toStr(v.provider_product_id),
        automatic: toBool(v.automatic),
        orderColumn: 0,
        status: 1,
        createdAt: toDate(v.created_at),
        updatedAt: toDate(v.updated_at),
      })),
    }),
  );

  // Build valid-id sets so we can drop/nullify orphaned foreign keys (old rows
  // often reference products/variations that were later deleted).
  const validUserIds = new Set(
    (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id),
  );
  const validProductIds = new Set(
    (await prisma.product.findMany({ select: { id: true } })).map((p) => p.id),
  );
  const validVariationIds = new Set(
    (await prisma.variation.findMany({ select: { id: true } })).map((v) => v.id),
  );

  // ---- Orders (before vouchers, which reference order_id) ----
  // Skip orders whose user or product no longer exists; null out missing variations.
  const orders = (await q('SELECT * FROM orders')).filter(
    (o) => validUserIds.has(o.user_id) && validProductIds.has(toInt(o.product_id) ?? -1),
  );
  await insertChunked('orders', orders, (chunk) =>
    prisma.order.createMany({
      skipDuplicates: true,
      data: chunk.map((o) => ({
        id: o.id,
        userId: o.user_id,
        productId: toInt(o.product_id)!,
        variationId: validVariationIds.has(toInt(o.variation_id) ?? -1)
          ? toInt(o.variation_id)
          : null,
        comboPackageId: null,
        quantity: toInt(o.quantity) ?? 1,
        amount: String(o.amount ?? 0),
        profit: String(o.profit ?? 0),
        trackId: o.track_id,
        accountInfo: parseAccountInfo(o.account_info) as any,
        voucherCode: toStr(o.voucher_code),
        deliveryMessage: toStr(o.delivery_message),
        topupRefId: null,
        paymentMethod: null,
        status: (ORDER_STATUS_MAP[String(o.status)] ?? 'pending') as any,
        createdAt: toDate(o.created_at),
        updatedAt: toDate(o.updated_at),
      })),
    }),
  );

  // Valid order ids (for nulling orphaned order references below).
  const validOrderIds = new Set(
    (await prisma.order.findMany({ select: { id: true } })).map((o) => o.id),
  );
  const validOrderId = (v: unknown) =>
    validOrderIds.has(toInt(v) ?? -1) ? toInt(v) : null;

  // ---- Vouchers (skip if variation missing; null orphaned order ref) ----
  const vouchers = (await q('SELECT * FROM vouchers')).filter((v) =>
    validVariationIds.has(v.variation_id),
  );
  await insertChunked('vouchers', vouchers, (chunk) =>
    prisma.voucher.createMany({
      skipDuplicates: true,
      data: chunk.map((v) => ({
        id: v.id,
        variationId: v.variation_id,
        code: v.code,
        status: normalizeStock(v.status, toInt(v.order_id)),
        orderId: validOrderId(v.order_id),
        transactionId: toStr(v.transaction_id),
        createdAt: toDate(v.created_at),
        updatedAt: toDate(v.updated_at),
      })),
    }),
  );

  // ---- Auto Vouchers ----
  const autoVouchers = (await q('SELECT * FROM auto_vouchers')).filter((v) =>
    validVariationIds.has(v.variation_id),
  );
  await insertChunked('auto_vouchers', autoVouchers, (chunk) =>
    prisma.autoVoucher.createMany({
      skipDuplicates: true,
      data: chunk.map((v) => ({
        id: v.id,
        variationId: v.variation_id,
        code: v.code,
        status: normalizeStock(v.status, toInt(v.order_id)),
        orderId: validOrderId(v.order_id),
        createdAt: toDate(v.created_at),
        updatedAt: toDate(v.updated_at),
      })),
    }),
  );

  // ---- Transactions (skip if user missing; null orphaned order ref) ----
  const transactions = (await q('SELECT * FROM transactions')).filter((t) =>
    validUserIds.has(t.user_id),
  );
  await insertChunked('transactions', transactions, (chunk) =>
    prisma.transaction.createMany({
      skipDuplicates: true,
      data: chunk.map((t) => ({
        id: t.id,
        userId: t.user_id,
        orderId: validOrderId(t.order_id),
        trxType: (t.trx_type === '+' ? 'credit' : 'debit') as any,
        amount: String(t.amount ?? 0),
        paymentMethod: String(t.payment_method ?? 'wallet'),
        transactionId: String(t.transaction_id ?? ''),
        remarks: toStr(t.remarks),
        createdAt: toDate(t.created_at),
        updatedAt: toDate(t.updated_at),
      })),
    }),
  );

  // ---- Deposits (skip if user missing) ----
  const deposits = (await q('SELECT * FROM deposits')).filter((d) =>
    validUserIds.has(d.user_id),
  );
  await insertChunked('deposits', deposits, (chunk) =>
    prisma.deposit.createMany({
      skipDuplicates: true,
      data: chunk.map((d) => ({
        id: d.id,
        userId: d.user_id,
        amount: String(d.amount ?? 0),
        paymentMethod: 'uddoktapay',
        transactionId: toStr(d.track_id),
        status: (String(d.status) === 'paid' ? 'paid' : 'pending') as any,
        createdAt: toDate(d.created_at),
        updatedAt: toDate(d.updated_at),
      })),
    }),
  );

  // ---- Sliders ----
  const sliders = await q('SELECT * FROM sliders');
  await insertChunked('sliders', sliders, (chunk) =>
    prisma.slider.createMany({
      skipDuplicates: true,
      data: chunk.map((s) => ({
        id: s.id,
        title: null,
        image: imageFor('Slider', s.id),
        url: toStr(s.url),
        orderColumn: toInt(s.order_column) ?? 0,
        status: toInt(s.status) ?? 1,
        createdAt: toDate(s.created_at),
        updatedAt: toDate(s.updated_at),
      })),
    }),
  );

  // ---- Pages ----
  const pages = await q('SELECT * FROM pages').catch(() => [] as any[]);
  await insertChunked('pages', pages, (chunk) =>
    prisma.page.createMany({
      skipDuplicates: true,
      data: chunk.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        content: String(p.content ?? ''),
        status: toInt(p.status) ?? 1,
        createdAt: toDate(p.created_at),
        updatedAt: toDate(p.updated_at),
      })),
    }),
  );

  // ---- Idempotency keys (skip if user missing) ----
  const idem = (await q('SELECT * FROM idempotency_keys').catch(() => [] as any[])).filter(
    (k) => validUserIds.has(k.user_id),
  );
  await insertChunked('idempotency_keys', idem, (chunk) =>
    prisma.idempotencyKey.createMany({
      skipDuplicates: true,
      data: chunk.map((k) => ({
        id: k.id,
        userId: k.user_id,
        key: k.key,
        createdAt: toDate(k.created_at),
        updatedAt: toDate(k.updated_at),
      })),
    }),
  );

  // ---- Settings (spatie group/name/payload -> flat key/value) ----
  const settings = await q('SELECT * FROM settings').catch(() => [] as any[]);
  const settingRows = settings.map((s) => {
    let decoded: unknown = s.payload;
    try {
      decoded = JSON.parse(s.payload);
    } catch {
      /* keep raw */
    }
    const value =
      decoded === null || decoded === undefined
        ? null
        : typeof decoded === 'string'
          ? decoded
          : JSON.stringify(decoded);
    // 'general' group keys stay bare; other groups get namespaced.
    const key = s.group === 'general' ? s.name : `${s.group}.${s.name}`;
    return { key, value };
  });
  // De-dupe by key (last wins) to respect the unique constraint.
  const settingByKey = new Map<string, string | null>();
  for (const r of settingRows) settingByKey.set(r.key, r.value);
  await insertChunked(
    'settings',
    [...settingByKey.entries()],
    (chunk) =>
      prisma.setting.createMany({
        skipDuplicates: true,
        data: chunk.map(([key, value]) => ({ key, value })),
      }),
  );

  // ---- Reset PostgreSQL sequences (we inserted explicit ids) ----
  console.log('\n→ Resetting id sequences...');
  const seqTables = [
    'users',
    'categories',
    'shells',
    'products',
    'variations',
    'orders',
    'vouchers',
    'auto_vouchers',
    'transactions',
    'deposits',
    'sliders',
    'pages',
    'settings',
    'idempotency_keys',
  ];
  for (const t of seqTables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1), true)`,
    );
  }
  console.log('  ✓ sequences reset');

  await conn.end();
  console.log('\n✅ Migration complete.');
}

main()
  .catch((e) => {
    console.error('\n❌ Migration failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
