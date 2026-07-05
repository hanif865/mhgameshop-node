import { notFound } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { Checkout, type CheckoutProduct } from '@/components/checkout/Checkout';

export const dynamic = 'force-dynamic';

export default async function TopupPage({ params }: { params: { slug: string } }) {
  const res = await apiGet<CheckoutProduct>(`/api/products/${params.slug}`);
  if (!res.success || !res.data) notFound();
  return <Checkout product={res.data} />;
}
