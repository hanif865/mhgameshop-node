'use client';

import { useEffect, useState } from 'react';
import { apiGet, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { money, formatDate } from '@/lib/format';

interface Txn {
  id: number;
  trxType: string;
  amount: string;
  paymentMethod: string;
  transactionId: string;
  remarks: string | null;
  createdAt: string;
  user?: { name: string };
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [type, setType] = useState('');

  useEffect(() => {
    setLoading(true);
    apiGet(`/api/admin/transactions?page=${page}&type=${type}`).then((res) => {
      const d = pageData<Txn>(res);
      setRows(d.items);
      setTotalPages(d.totalPages);
      setLoading(false);
    });
  }, [page, type]);

  const columns: Column<Txn>[] = [
    { key: 'id', label: 'ID' },
    { key: 'user', label: 'User', render: (r) => r.user?.name ?? '—' },
    { key: 'trxType', label: 'Type', render: (r) => <StatusBadge status={r.trxType} /> },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'paymentMethod', label: 'Method' },
    { key: 'remarks', label: 'Remarks', render: (r) => r.remarks ?? '—' },
    { key: 'created', label: 'Date', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Transactions</h1>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        filters={[
          {
            value: type,
            onChange: (v) => {
              setPage(1);
              setType(v);
            },
            options: [
              { value: '', label: 'All types' },
              { value: 'credit', label: 'Credit' },
              { value: 'debit', label: 'Debit' },
            ],
          },
        ]}
      />
    </div>
  );
}
