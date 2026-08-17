import Link from 'next/link';
import { Send } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { NoticeBar } from '@/components/home/NoticeBar';
import { HeroSlider } from '@/components/home/HeroSlider';
import { ProductCard, type ProductLite } from '@/components/home/ProductCard';
import { LatestOrders } from '@/components/home/LatestOrders';
import { TopRankedUsers, type TopUser } from '@/components/home/TopRankedUsers';
import { InstallAppButton } from '@/components/home/InstallAppButton';

interface Product extends ProductLite {
  category: { id: number; title: string; orderColumn?: number } | null;
}

// Rendered on-demand (not prerendered at build) so it always shows live data
// and never fails the build when the API isn't reachable.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [productsRes, slidersRes, ordersRes, topUsersRes] = await Promise.all([
    apiGet<Product[]>('/api/products', 60),
    apiGet<any[]>('/api/sliders', 60),
    apiGet<any[]>('/api/home/latest-orders', 15),
    apiGet<TopUser[]>('/api/home/top-users', 300),
  ]);

  const products = productsRes.data ?? [];
  const sliders = slidersRes.data ?? [];
  const latestOrders = ordersRes.data ?? [];
  const topUsers = topUsersRes.data ?? [];

  // Group products by category, then order the groups by the category's
  // order_column (managed from the admin panel).
  const groups = new Map<string, { title: string; order: number; items: Product[] }>();
  for (const p of products) {
    const key = String(p.category?.id ?? 0);
    if (!groups.has(key))
      groups.set(key, {
        title: p.category?.title ?? 'Products',
        order: p.category?.orderColumn ?? 999,
        items: [],
      });
    groups.get(key)!.items.push(p);
  }
  const orderedGroups = [...groups.values()].sort((a, b) => a.order - b.order);

  return (
    <div>
      <NoticeBar />

      <div className="container-page space-y-10 py-5">
        <HeroSlider slides={sliders} />

        <div id="products" className="space-y-8">
          {orderedGroups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-4 flex items-center justify-center gap-2 text-lg font-bold text-slate-800">
                <span className="h-5 w-1.5 rounded-full bg-gold" />
                {group.title}
              </h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                {group.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ))}

          {products.length === 0 && (
            <p className="py-16 text-center text-slate-400">No products available yet.</p>
          )}
        </div>

        <LatestOrders orders={latestOrders} />

        <TopRankedUsers users={topUsers} />

        {/* Telegram bot promo */}
        <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-primary-dark via-primary to-emerald-700 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15">
                <Send size={30} />
              </span>
              <div>
                <h2 className="text-xl font-extrabold sm:text-2xl">⚡ টেলিগ্রামেই ইনস্ট্যান্ট টপ-আপ!</h2>
                <p className="mt-1 text-sm text-white/85">
                  ২৪/৭ অটোমেটিক — সেকেন্ডেই ডায়মন্ড ও ভাউচার সরাসরি আমাদের বট থেকে।
                </p>
              </div>
            </div>
            <a
              href="https://t.me/mh_game_shop_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-xl bg-gold px-6 py-3 font-bold text-white shadow-md transition hover:bg-gold-light"
            >
              বট চালু করুন →
            </a>
          </div>
        </section>

        {/* CTA strip */}
        <section className="grid gap-4 sm:grid-cols-2">
          <InstallAppButton />
          <Link
            href="/#products"
            className="flex items-center gap-4 rounded-2xl bg-primary p-5 text-white transition hover:bg-primary-dark"
          >
            <Send size={28} />
            <div>
              <p className="text-xs opacity-80">Join our</p>
              <p className="text-lg font-bold">Telegram Channel</p>
            </div>
          </Link>
        </section>
      </div>
    </div>
  );
}
