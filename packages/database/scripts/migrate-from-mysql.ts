/**
 * MH Game Shop — MySQL -> PostgreSQL migration (current schema).
 *
 * The current Laravel DB schema matches the Prisma models almost 1:1 (clean
 * column names, combo tables, image columns, credit/debit, autoprocessing).
 * This script maps it directly, preserving ids + relations, and is FK-safe
 * (skips rows whose parents were deleted; nulls orphaned optional refs).
 *
 * Usage:  npm run migrate:mysql   (with MYSQL_* + DATABASE_URL env set)
 * Idempotent: createMany({ skipDuplicates }).
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
const toDate = (v: unknown): Date => (v ? new Date(v as string) : new Date());
const dec = (v: unknown): string => String(v ?? 0);

const stock = (raw: unknown, orderId: number | null): 'available' | 'sold' => {
  if (orderId) return 'sold';
  return String(raw).toLowerCase() === 'sold' ? 'sold' : 'available';
};

const ROLES = new Set(['user', 'admin', 'reseller']);
const normRole = (r: unknown): 'user' | 'admin' | 'reseller' => {
  const s = String(r ?? 'user').toLowerCase();
  return (ROLES.has(s) ? s : 'user') as 'user' | 'admin' | 'reseller';
};

function parseJson(raw: unknown): unknown {
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
    await fn(rows.slice(i, i + size));
    done += Math.min(size, rows.length - i);
  }
  console.log(`  ✓ ${label}: ${done} rows`);
}

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
    const [rows] = await conn.query(sql).catch(() => [[]] as any);
    return rows as R[];
  };
  console.log('→ Connected to MySQL. Starting migration...\n');

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
        googleId: toStr(u.google_id),
        googleAvatar: toStr(u.google_avatar),
        avatar: toStr(u.avatar),
        phone: toStr(u.phone),
        balance: dec(u.balance),
        role: normRole(u.role),
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
        icon: toStr(c.icon),
        orderColumn: toInt(c.order_column) ?? 0,
        status: toInt(c.status) ?? 1,
        createdAt: toDate(c.created_at),
        updatedAt: toDate(c.updated_at),
      })),
    }),
  );

  // ---- Shells ----
  const shells = await q('SELECT * FROM shells');
  await insertChunked('shells', shells, (chunk) =>
    prisma.shell.createMany({
      skipDuplicates: true,
      data: chunk.map((s) => ({
        id: s.id,
        name: String(s.name),
        username: s.username,
        password: s.password,
        autocode: s.autocode,
        shellbalance: toStr(s.shellbalance),
        tgbotid: toStr(s.tgbotid),
        status: toInt(s.status) ?? 1,
        createdAt: toDate(s.created_at),
        updatedAt: toDate(s.updated_at),
      })),
    }),
  );

  // ---- Products (image + description from columns) ----
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
        image: toStr(p.image),
        description: toStr(p.description),
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
        price: dec(v.price),
        buyRate: dec(v.buy_rate),
        stock: toInt(v.stock) ?? 0,
        provider: toStr(v.provider),
        providerProductId: toStr(v.provider_product_id),
        automatic: toBool(v.automatic),
        orderColumn: toInt(v.order_column) ?? 0,
        status: 1,
        createdAt: toDate(v.created_at),
        updatedAt: toDate(v.updated_at),
      })),
    }),
  );

  // ---- Combo packages / items / vouchers ----
  const combos = await q('SELECT * FROM combo_packages');
  await insertChunked('combo_packages', combos, (chunk) =>
    prisma.comboPackage.createMany({
      skipDuplicates: true,
      data: chunk.map((c) => ({
        id: c.id,
        productId: c.product_id,
        title: c.title,
        price: dec(c.price),
        buyRate: dec(c.buy_rate),
        stock: toInt(c.stock) ?? 0,
        orderColumn: toInt(c.order_column) ?? 0,
        status: toInt(c.status) ?? 1,
        createdAt: toDate(c.created_at),
        updatedAt: toDate(c.updated_at),
      })),
    }),
  );

  const comboItems = await q('SELECT * FROM combo_package_items');
  await insertChunked('combo_package_items', comboItems, (chunk) =>
    prisma.comboPackageItem.createMany({
      skipDuplicates: true,
      data: chunk.map((i) => ({
        id: i.id,
        comboPackageId: i.combo_package_id,
        title: toStr(i.title),
        quantity: toInt(i.quantity) ?? 1,
        orderColumn: toInt(i.order_column) ?? 0,
        createdAt: toDate(i.created_at),
        updatedAt: toDate(i.updated_at),
      })),
    }),
  );

  const comboVouchers = await q('SELECT * FROM combo_package_vouchers');
  await insertChunked('combo_package_vouchers', comboVouchers, (chunk) =>
    prisma.comboPackageVoucher.createMany({
      skipDuplicates: true,
      data: chunk.map((v) => ({
        id: v.id,
        comboPackageItemId: v.combo_package_item_id,
        code: String(v.code),
        status: stock(v.status, toInt(v.order_id)),
        orderId: toInt(v.order_id),
        createdAt: toDate(v.created_at),
        updatedAt: toDate(v.updated_at),
      })),
    }),
  );

  // Valid-id sets for FK-safe inserts.
  const idSet = async (table: 'user' | 'product' | 'variation' | 'comboPackage' | 'comboPackageItem' | 'comboPackageVoucher' | 'order') => {
    const rows = await (prisma[table] as any).findMany({ select: { id: true } });
    return new Set<number>(rows.map((r: any) => r.id));
  };
  const validUsers = await idSet('user');
  const validProducts = await idSet('product');
  const validVariations = await idSet('variation');
  const validCombos = await idSet('comboPackage');
  const validComboItems = await idSet('comboPackageItem');
  const validComboVouchers = await idSet('comboPackageVoucher');
  const has = (s: Set<number>, v: unknown) => s.has(toInt(v) ?? -1);
  const orNull = (s: Set<number>, v: unknown) => (has(s, v) ? toInt(v) : null);

  // ---- Orders ----
  const orders = (await q('SELECT * FROM orders')).filter(
    (o) => validUsers.has(o.user_id) && has(validProducts, o.product_id),
  );
  await insertChunked('orders', orders, (chunk) =>
    prisma.order.createMany({
      skipDuplicates: true,
      data: chunk.map((o) => ({
        id: o.id,
        userId: o.user_id,
        productId: toInt(o.product_id)!,
        variationId: orNull(validVariations, o.variation_id),
        comboPackageId: orNull(validCombos, o.combo_package_id),
        quantity: toInt(o.quantity) ?? 1,
        amount: dec(o.amount),
        profit: dec(o.profit),
        trackId: o.track_id,
        accountInfo: parseJson(o.account_info) as any,
        voucherCode: toStr(o.voucher_code),
        deliveryMessage: toStr(o.delivery_message),
        topupRefId: toStr(o.topup_ref_id),
        paymentMethod: toStr(o.payment_method),
        status: String(o.status),
        createdAt: toDate(o.created_at),
        updatedAt: toDate(o.updated_at),
      })),
    }),
  );
  const validOrders = await idSet('order');

  // ---- Combo order items ----
  const comboOrderItems = (await q('SELECT * FROM combo_order_items')).filter(
    (c) => validOrders.has(c.order_id) && has(validComboItems, c.combo_package_item_id),
  );
  await insertChunked('combo_order_items', comboOrderItems, (chunk) =>
    prisma.comboOrderItem.createMany({
      skipDuplicates: true,
      data: chunk.map((c) => ({
        id: c.id,
        orderId: c.order_id,
        comboPackageItemId: c.combo_package_item_id,
        comboPackageVoucherId: orNull(validComboVouchers, c.combo_package_voucher_id),
        itemIndex: toInt(c.item_index) ?? 0,
        status: String(c.status || 'pending'),
        responseContent: toStr(c.response_content),
        createdAt: toDate(c.created_at),
        updatedAt: toDate(c.updated_at),
      })),
    }),
  );

  // ---- Vouchers / Auto vouchers ----
  const vouchers = (await q('SELECT * FROM vouchers')).filter((v) =>
    validVariations.has(v.variation_id),
  );
  await insertChunked('vouchers', vouchers, (chunk) =>
    prisma.voucher.createMany({
      skipDuplicates: true,
      data: chunk.map((v) => ({
        id: v.id,
        variationId: v.variation_id,
        code: String(v.code),
        status: stock(v.status, toInt(v.order_id)),
        orderId: orNull(validOrders, v.order_id),
        transactionId: toStr(v.transaction_id),
        createdAt: toDate(v.created_at),
        updatedAt: toDate(v.updated_at),
      })),
    }),
  );

  const autoVouchers = (await q('SELECT * FROM auto_vouchers')).filter((v) =>
    validVariations.has(v.variation_id),
  );
  await insertChunked('auto_vouchers', autoVouchers, (chunk) =>
    prisma.autoVoucher.createMany({
      skipDuplicates: true,
      data: chunk.map((v) => ({
        id: v.id,
        variationId: v.variation_id,
        code: String(v.code),
        status: stock(v.status, toInt(v.order_id)),
        orderId: orNull(validOrders, v.order_id),
        createdAt: toDate(v.created_at),
        updatedAt: toDate(v.updated_at),
      })),
    }),
  );

  // ---- Transactions ----
  const transactions = (await q('SELECT * FROM transactions')).filter((t) =>
    validUsers.has(t.user_id),
  );
  await insertChunked('transactions', transactions, (chunk) =>
    prisma.transaction.createMany({
      skipDuplicates: true,
      data: chunk.map((t) => ({
        id: t.id,
        userId: t.user_id,
        orderId: orNull(validOrders, t.order_id),
        trxType: (String(t.trx_type) === 'credit' ? 'credit' : 'debit') as any,
        amount: dec(t.amount),
        paymentMethod: String(t.payment_method ?? 'wallet'),
        transactionId: String(t.transaction_id ?? ''),
        remarks: toStr(t.remarks),
        createdAt: toDate(t.created_at),
        updatedAt: toDate(t.updated_at),
      })),
    }),
  );

  // ---- Deposits ----
  const deposits = (await q('SELECT * FROM deposits')).filter((d) => validUsers.has(d.user_id));
  await insertChunked('deposits', deposits, (chunk) =>
    prisma.deposit.createMany({
      skipDuplicates: true,
      data: chunk.map((d) => ({
        id: d.id,
        userId: d.user_id,
        amount: dec(d.amount),
        paymentMethod: String(d.payment_method ?? 'uddoktapay'),
        transactionId: toStr(d.transaction_id) ?? toStr(d.track_id),
        status: (['pending', 'paid', 'failed'].includes(String(d.status))
          ? String(d.status)
          : 'pending') as any,
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
        title: toStr(s.title),
        image: toStr(s.image),
        url: toStr(s.url),
        orderColumn: toInt(s.order_column) ?? 0,
        status: toInt(s.status) ?? 1,
        createdAt: toDate(s.created_at),
        updatedAt: toDate(s.updated_at),
      })),
    }),
  );

  // ---- Pages ----
  const pages = await q('SELECT * FROM pages');
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

  // ---- Idempotency keys ----
  const idem = (await q('SELECT * FROM idempotency_keys')).filter((k) =>
    validUsers.has(k.user_id),
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

  // ---- Settings (spatie group/name/payload -> key/value) ----
  const settings = await q('SELECT * FROM settings');
  const byKey = new Map<string, string | null>();
  for (const s of settings) {
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
    const key = s.group === 'general' ? s.name : `${s.group}.${s.name}`;
    byKey.set(key, value);
  }
  await insertChunked('settings', [...byKey.entries()], (chunk) =>
    prisma.setting.createMany({
      skipDuplicates: true,
      data: chunk.map(([key, value]) => ({ key, value })),
    }),
  );

  // ---- Reset sequences ----
  console.log('\n→ Resetting id sequences...');
  const seqTables = [
    'users', 'categories', 'shells', 'products', 'variations',
    'combo_packages', 'combo_package_items', 'combo_package_vouchers',
    'orders', 'combo_order_items', 'vouchers', 'auto_vouchers',
    'transactions', 'deposits', 'sliders', 'pages', 'settings', 'idempotency_keys',
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
