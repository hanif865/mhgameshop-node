import Link from 'next/link';
import { imageUrl } from '@/lib/config';

export interface ProductLite {
  id: number;
  title: string;
  slug: string;
  type: string;
  image: string | null;
  variations?: { id: number; stock: number }[];
}

export function ProductCard({ product }: { product: ProductLite }) {
  const inStock =
    product.type !== 'voucher' ||
    (product.variations?.some((v) => v.stock > 0) ?? false);

  return (
    <Link
      href={`/topup/${product.slug}`}
      className="group card overflow-hidden transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl(product.image)}
          alt={product.title}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
        {!inStock && (
          <span className="absolute left-2 top-2 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
            STOCK OUT
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-center text-xs font-semibold text-slate-700 sm:text-sm">
          {product.title}
        </p>
      </div>
    </Link>
  );
}
