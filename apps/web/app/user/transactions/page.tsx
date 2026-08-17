'use client';

import { useEffect, useState } from 'react';
import { Loader2, ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { money, formatDate } from '@/lib/format';

interface Txn {
  id: number;
  trxType: 'credit' | 'debit';
  amount: string;
  paymentMethod: string;
  remarks: string | null;
  createdAt: string;
}

export default function TransactionsPage() {
  const [items, setItems] = useState<Txn[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<{ items: Txn[]; totalPages: number }>(`/api/user/transactions?page=${page}`).then(
      (res) => {
        const d = res.data as any;
        setItems(d?.items ?? []);
        setTotalPages(d?.totalPages ?? 1);
        setLoading(false);
      },
    );
  }, [page]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-slate-800">Transactions</h1>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions yet."
          subtitle="Your wallet activity will show up here."
        />
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {items.map((t) => {
            // credit = wallet spent on order; debit = money added (matches API).
            const isIncoming = t.trxType === 'debit';
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full ${
                    isIncoming ? 'bg-primary/10 text-primary-dark' : 'bg-red-100 text-red-600'
                  }`}
                >
                  {isIncoming ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {t.remarks || t.paymentMethod}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(t.createdAt)}</p>
                </div>
                <span
                  className={`font-bold ${isIncoming ? 'text-primary-dark' : 'text-red-600'}`}
                >
                  {isIncoming ? '+' : '−'}
                  {money(t.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
