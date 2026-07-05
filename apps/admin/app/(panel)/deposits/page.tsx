'use client';

import { useEffect, useState } from 'react';
import { apiGet, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { money, formatDate } from '@/lib/format';

interface Deposit {
  id: number;
  amount: string;
  paymentMethod: string;
  transactionId: string | null;
  status: string;
  createdAt: string;
  user?: { name: string; email: string };
}

export default function DepositsPage() {
  const [rows, setRows] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    apiGet(`/api/admin/deposits?page=${page}&status=${status}`).then((res) => {
      const d = pageData<Deposit>(res);
      setRows(d.items);
      setTotalPages(d.totalPages);
      setLoading(false);
    });
  }, [page, status]);

  const columns: Column<Deposit>[] = [
    { key: 'id', label: 'ID' },
    { key: 'user', label: 'User', render: (r) => r.user?.name ?? '—' },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'paymentMethod', label: 'Method' },
    { key: 'transactionId', label: 'Txn ID', render: (r) => r.transactionId ?? '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created', label: 'Date', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Deposits</h1>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        filters={[
          {
            value: status,
            onChange: (v) => {
              setPage(1);
              setStatus(v);
            },
            options: [
              { value: '', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'paid', label: 'Paid' },
              { value: 'failed', label: 'Failed' },
            ],
          },
        ]}
      />
    </div>
  );
}
