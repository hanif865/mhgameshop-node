'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiPut, pageData } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

export interface ComboData {
  id?: number;
  productId?: number;
  title?: string;
  price?: number | string;
  buyRate?: number | string;
  stock?: number;
  orderColumn?: number;
  status?: number;
}

export function ComboForm({ initial, onSaved }: { initial?: ComboData; onSaved?: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<ComboData>(initial ?? { status: 1, orderColumn: 0 });
  const [products, setProducts] = useState<{ id: number; title: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet('/api/admin/products?perPage=100').then((r) => setProducts(pageData<any>(r).items));
  }, []);

  async function save() {
    if (!form.productId || !form.title) return toast.error('Product and title are required.');
    setSaving(true);
    const body = {
      productId: form.productId,
      title: form.title,
      price: Number(form.price ?? 0),
      buyRate: Number(form.buyRate ?? 0),
      stock: Number(form.stock ?? 0),
      orderColumn: form.orderColumn ?? 0,
      status: form.status ?? 1,
    };
    const res = form.id
      ? await apiPut(`/api/admin/combos/${form.id}`, body)
      : await apiPost('/api/admin/combos', body);
    setSaving(false);
    if (res.success) {
      toast.success('Saved.');
      if (onSaved) onSaved();
      else router.push('/combos');
    } else toast.error(res.message || 'Save failed.');
  }

  return (
    <div className="card max-w-xl space-y-4 p-6">
      <div>
        <label className="label">Product</label>
        <select
          className="input"
          value={form.productId ?? ''}
          onChange={(e) => setForm({ ...form, productId: Number(e.target.value) })}
        >
          <option value="">Select…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Title</label>
        <input className="input" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Price</label>
          <input type="number" className="input" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div>
          <label className="label">Buy Rate</label>
          <input type="number" className="input" value={form.buyRate ?? 0} onChange={(e) => setForm({ ...form, buyRate: e.target.value })} />
        </div>
        <div>
          <label className="label">Stock</label>
          <input type="number" className="input" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input w-40" value={form.status ?? 1} onChange={(e) => setForm({ ...form, status: Number(e.target.value) })}>
          <option value={1}>Active</option>
          <option value={0}>Inactive</option>
        </select>
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Combo'}
        </button>
      </div>
    </div>
  );
}
