import Link from 'next/link';
import { Play, Send } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { NoticeBar } from '@/components/home/NoticeBar';
import { HeroSlider } from '@/components/home/HeroSlider';
import { ProductCard, type ProductLite } from '@/components/home/ProductCard';
import { LatestOrders } from '@/components/home/LatestOrders';

interface Product extends ProductLite {
  category: { id: number; title: string } | null;
}

export const revalidate = 60;

export default async function HomePage() {
  const [productsRes, slidersRes, ordersRes] = await Promise.all([
    apiGet<Product[]>('/api/products', 60),
    apiGet<any[]>('/api/sliders', 60),
    apiGet<any[]>('/api/home/latest-orders', 30),
  ]);

  const products = productsRes.data ?? [];
  const sliders = slidersRes.data ?? [];
  const latestOrders = ordersRes.data ?? [];

  // Group products by category, preserving API order.
  const groups = new Map<string, { title: string; items: Product[] }>();
  for (const p of products) {
    const key = String(p.category?.id ?? 0);
    if (!groups.has(key)) groups.set(key, { title: p.category?.title ?? 'Products', items: [] });
    groups.get(key)!.items.push(p);
  }

  return (
    <div>
      <NoticeBar />

      <div className="container-page space-y-10 py-5">
        <HeroSlider slides={sliders} />

        <div id="products" className="space-y-8">
          {[...groups.values()].map((group) => (
            <section key={group.title}>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
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

        {/* CTA strip */}
        <section className="grid gap-4 sm:grid-cols-2">
          <a
            href="#"
            className="flex items-center gap-4 rounded-2xl bg-slate-900 p-5 text-white transition hover:bg-slate-800"
          >
            <Play size={28} className="fill-white" />
            <div>
              <p className="text-xs opacity-70">Get it on</p>
              <p className="text-lg font-bold">Google Play</p>
            </div>
          </a>
          <Link
            href="/#products"
            className="flex items-center gap-4 rounded-2xl bg-sky-500 p-5 text-white transition hover:bg-sky-600"
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
