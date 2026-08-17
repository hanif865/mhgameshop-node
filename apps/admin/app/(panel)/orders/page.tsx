'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { apiGet, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { money, formatDate } from '@/lib/format';

interface Order {
  id: number;
  status: string;
  amount: string;
  createdAt: string;
  accountInfo: Record<string, string> | null;
  user?: { name: string };
  product?: { title: string };
  variation?: { title: string };
  comboPackage?: { title: string };
}

export default function OrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const res = await apiGet(
      `/api/admin/orders?page=${page}&status=${status}&search=${encodeURIComponent(search)}`,
    );
    const d = pageData<Order>(res);
    setRows(d.items);
    setTotalPages(d.totalPages);
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, search]);

  const columns: Column<Order>[] = [
    { key: 'id', label: 'ID', render: (r) => `#${r.id}` },
    { key: 'user', label: 'User', render: (r) => r.user?.name ?? '—' },
    { key: 'product', label: 'Product', render: (r) => r.product?.title ?? '—' },
    {
      key: 'pkg',
      label: 'Variation / Combo',
      render: (r) => r.variation?.title ?? r.comboPackage?.title ?? '—',
    },
    {
      key: 'account',
      label: 'Account Info',
      render: (r) => {
        const ai = r.accountInfo;
        if (!ai) return '—';
        if (ai.player_id) return ai.player_id;
        const vals = Object.values(ai).filter(Boolean);
        return vals.length ? vals.join(', ') : '—';
      },
    },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'date', label: 'Date', render: (r) => formatDate(r.createdAt) },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <Link href={`/orders/${r.id}`} className="btn-ghost px-2 py-1">
          <Eye size={14} />
        </Link>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Orders</h1>
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
          placeholder: 'Search player ID / user…',
        }}
        filters={[
          {
            value: status,
            onChange: (v) => {
              setPage(1);
              setStatus(v);
            },
            options: [
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'processing', label: 'Processing' },
              { value: 'autoprocessing', label: 'Auto Processing' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'hold', label: 'Hold' },
            ],
          },
        ]}
      />
    </div>
  );
}
