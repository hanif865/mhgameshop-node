'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { ProductForm, type ProductData } from '@/components/forms/ProductForm';

export default function EditProduct({ params }: { params: { id: string } }) {
  const [data, setData] = useState<ProductData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiGet<ProductData>(`/api/admin/products/${params.id}`).then((res) => {
      if (res.success && res.data) setData(res.data);
      else setNotFound(true);
    });
  }, [params.id]);

  if (notFound) return <p className="text-slate-400">Product not found.</p>;
  if (!data)
    return (
      <div className="flex justify-center py-16 text-slate-300">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Edit Product</h1>
      <ProductForm initial={data} />
    </div>
  );
}
