'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiGet, apiDelete, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { money } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

interface Combo {
  id: number;
  title: string;
  price: string;
  stock: number;
  status: number;
  product?: { title: string };
  _count?: { items: number };
}

export default function CombosPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  async function load() {
    setLoading(true);
    const res = await apiGet(`/api/admin/combos?page=${page}`);
    const d = pageData<Combo>(res);
    setRows(d.items);
    setTotalPages(d.totalPages);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function remove(id: number) {
    if (!confirm('Delete this combo?')) return;
    const res = await apiDelete(`/api/admin/combos/${id}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const columns: Column<Combo>[] = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: 'Title' },
    { key: 'product', label: 'Product', render: (r) => r.product?.title ?? '—' },
    { key: 'price', label: 'Price', render: (r) => money(r.price) },
    { key: 'stock', label: 'Stock' },
    { key: 'items', label: 'Items', render: (r) => r._count?.items ?? 0 },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Link href={`/combos/${r.id}/edit`} className="btn-ghost px-2 py-1">
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
        <h1 className="text-2xl font-bold text-slate-800">Combo Packages</h1>
        <Link href="/combos/create" className="btn-primary">
          <Plus size={16} /> New Combo
        </Link>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
