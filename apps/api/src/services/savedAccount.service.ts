import { prisma } from '../config/database';

/**
 * সেভড অ্যাকাউন্ট (Player ID) — একবার টপ-আপ করলে ঐ গেমের UID সেভ থাকে,
 * পরেরবার ইউজার ১ ক্লিকে বেছে নিয়ে দ্রুত অর্ডার করতে পারে।
 *
 * টেবিল schema.prisma এর বাইরে (raw SQL)। প্রতি (user, product, player_id) ইউনিক।
 */

export async function ensureSavedAccountsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saved_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      nickname TEXT,
      last_used_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE (user_id, product_id, player_id)
    )`);
}

export async function listSavedAccounts(userId: number, productId: number) {
  return prisma.$queryRaw<{ player_id: string; nickname: string | null }[]>`
    SELECT player_id, nickname
      FROM saved_accounts
     WHERE user_id = ${userId} AND product_id = ${productId}
     ORDER BY last_used_at DESC
     LIMIT 15`;
}

export async function saveAccount(
  userId: number,
  productId: number,
  playerId: string,
  nickname: string | null,
): Promise<void> {
  const pid = String(playerId ?? '').trim();
  if (!pid) return;
  await prisma.$executeRaw`
    INSERT INTO saved_accounts (user_id, product_id, player_id, nickname, last_used_at)
    VALUES (${userId}, ${productId}, ${pid}, ${nickname}, now())
    ON CONFLICT (user_id, product_id, player_id)
    DO UPDATE SET nickname = COALESCE(EXCLUDED.nickname, saved_accounts.nickname),
                  last_used_at = now()`;
}

export async function removeSavedAccount(
  userId: number,
  productId: number,
  playerId: string,
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM saved_accounts
     WHERE user_id = ${userId} AND product_id = ${productId} AND player_id = ${playerId}`;
}
