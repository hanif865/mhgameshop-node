/**
 * Seed baseline settings so a fresh install boots with sensible defaults.
 * Safe to run repeatedly — uses upsert and never overwrites existing values.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: 'MH Game Shop',
  site_title: 'MH Game Shop — Game Top Up',
  site_description: 'Fast & reliable game top-up, vouchers and subscriptions.',
  wallet: '1',
  enable_notice: '0',
  notice_title: '',
  notice_content: '',
  notice_background_color: '#16a34a',
  notice_font_color: '#ffffff',
  uddoktapay_enabled: '0',
  uddoktapay_api_url: '',
  enable_auto_topup: '0',
  topup_provider: 'freefire',
  free_fire_server_url: 'https://api.topupnet.com/api/v1',
  // Top Ranked Users — home leaderboard badge (routes/public.ts:/home/top-users)
  top_users_enabled: '1',
  top_users_monthly: '1',
  top_users_count: '10',
  // Levels & Discounts — ইউনিফায়েড ৫-লেভেল (utils/levels.ts); discount সব 0 = safe launch,
  // owner admin থেকে % সেট করলে তবেই checkout-এ ছাড় বসে। min ও discount দুটোই admin-এডিটযোগ্য।
  level_bronze_min: '2000',
  level_bronze_discount: '0',
  level_silver_min: '5000',
  level_silver_discount: '0',
  level_gold_min: '10000',
  level_gold_discount: '0',
  level_platinum_min: '20000',
  level_platinum_discount: '0',
  level_premium_min: '50000',
  level_premium_discount: '0',
};

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {}, // never clobber an existing configured value
      create: { key, value },
    });
  }
  console.log(`✓ Seeded ${Object.keys(DEFAULT_SETTINGS).length} default settings.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
