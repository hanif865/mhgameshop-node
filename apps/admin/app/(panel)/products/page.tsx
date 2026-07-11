'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiGet, apiDelete, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { imageUrl } from '@/lib/config';
import { useToast } from '@/components/ui/Toast';

interface Product {
  id: number;
  title: string;
  slug: string;
  type: string;
  image: string | null;
  status: number;
  orderColumn?: number;
  category?: { title: string };
  _count?: { variations: number; comboPackages: number };
}

export default function ProductsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet(`/api/admin/products?page=${page}&search=${encodeURIComponent(search)}`);
    const d = pageData<Product>(res);
    setRows(d.items);
    setTotalPages(d.totalPages);
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  async function confirmDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    const res = await apiDelete(`/api/admin/products/${deleteId}`);
    setDeleting(false);
    if (res.success) {
      toast.success('Deleted.');
      setDeleteId(null);
      load();
    } else toast.error(res.message || 'Delete failed.');
  }

  const columns: Column<Product>[] = [
    {
      key: 'title',
      label: 'Product',
      render: (r) => (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(r.image)} alt="" className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <p className="font-medium text-slate-800">{r.title}</p>
            <p className="text-xs text-slate-400">{r.slug}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', label: 'Category', render: (r) => r.category?.title ?? '—' },
    { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
    { key: 'variations', label: 'Variations', render: (r) => r._count?.variations ?? 0 },
    { key: 'order', label: 'Order', render: (r) => r.orderColumn ?? 0 },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Link href={`/products/${r.id}/edit`} className="btn-ghost px-2 py-1">
            <Pencil size={14} />
          </Link>
          <button onClick={() => setDeleteId(r.id)} className="btn-danger px-2 py-1">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Products</h1>
        <Link href="/products/create" className="btn-primary">
          <Plus size={16} /> New Product
        </Link>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        search={{ value: search, onChange: (v) => { setPage(1); setSearch(v); }, placeholder: 'Search products…' }}
      />

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete product?"
        message="This will permanently delete the product and its variations. This action cannot be undone."
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
