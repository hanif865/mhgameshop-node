'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { money } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

interface Variation {
  id: number;
  title: string;
  price: string;
  stock: number;
  automatic: boolean;
  product?: { title: string };
  _count?: { vouchers: number; autoVouchers: number };
}

export default function VariationsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [creating, setCreating] = useState(false);
  const [products, setProducts] = useState<{ id: number; title: string }[]>([]);
  const [form, setForm] = useState<any>({ automatic: false, status: 1 });
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const res = await apiGet(`/api/admin/variations?page=${page}&search=${encodeURIComponent(search)}`);
    const d = pageData<Variation>(res);
    setRows(d.items);
    setTotalPages(d.totalPages);
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  async function openCreate() {
    const res = await apiGet(`/api/admin/products?perPage=100`);
    setProducts(pageData<any>(res).items);
    setForm({ automatic: false, status: 1, price: 0, buyRate: 0, stock: 0 });
    setCreating(true);
  }

  async function create() {
    if (!form.productId || !form.title) return toast.error('Product and title are required.');
    const res = await apiPost('/api/admin/variations', form);
    if (res.success) {
      toast.success('Created.');
      setCreating(false);
      load();
    } else toast.error(res.message || 'Failed.');
  }

  async function remove(id: number) {
    if (!confirm('Delete this variation?')) return;
    const res = await apiDelete(`/api/admin/variations/${id}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const columns: Column<Variation>[] = [
    { key: 'product', label: 'Product', render: (r) => r.product?.title ?? '—' },
    { key: 'title', label: 'Variation' },
    { key: 'price', label: 'Price', render: (r) => money(r.price) },
    { key: 'stock', label: 'Stock' },
    {
      key: 'automatic',
      label: 'Auto Topup',
      render: (r) => (
        <span className={r.automatic ? 'text-primary-dark font-semibold' : 'text-slate-400'}>
          {r.automatic ? 'On' : 'Off'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Link href={`/variations/${r.id}/edit`} className="btn-ghost px-2 py-1">
            <Pencil size={14} />
          </Link>
          <button onClick={() => remove(r.id)} className="btn-danger px-2 py-1">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Variations</h1>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Variation
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        search={{
          value: search,
          onChange: (v) => {
            setPage(1);
            setSearch(v);
          },
          placeholder: 'Search variation / product…',
        }}
      />

      <Modal open={creating} onClose={() => setCreating(false)} title="New Variation">
        <div className="space-y-3">
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
              <input type="number" className="input" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Buy Rate</label>
              <input type="number" className="input" value={form.buyRate ?? 0} onChange={(e) => setForm({ ...form, buyRate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Stock</label>
              <input type="number" className="input" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
            <button onClick={create} className="btn-primary">Create</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
