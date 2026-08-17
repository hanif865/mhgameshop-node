'use client';

import { useEffect, useState } from 'react';
import { Loader2, Copy, Check, Gift, Ticket } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/lib/settings';
import { shortDate } from '@/lib/format';

interface CodeOrder {
  id: number;
  voucherCode: string | null;
  createdAt: string;
  product: { title: string } | null;
  variation: { title: string } | null;
}

export default function CodesPage() {
  const toast = useToast();
  const { get } = useSettings();
  const redeemUrl = get('unipin_redeem_url', 'https://shop.garena.my/');
  const [orders, setOrders] = useState<CodeOrder[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<{ items: CodeOrder[]; totalPages: number }>(`/api/user/codes?page=${page}`).then((res) => {
      const d = res.data as any;
      setOrders(d?.items ?? []);
      setTotalPages(d?.totalPages ?? 1);
      setLoading(false);
    });
  }, [page]);

  async function copy(id: number, code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(id);
    toast.success('Code copied!');
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-slate-800">My Codes</h1>
        <a
          href={redeemUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-gold px-4 py-2 text-sm"
        >
          <Gift size={16} /> Redeem Code
        </a>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No voucher codes yet."
          subtitle="Codes from your voucher purchases will appear here."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">
                  {o.variation?.title ?? o.product?.title}
                </p>
                <span className="text-xs text-slate-400">{shortDate(o.createdAt)}</span>
              </div>
              <div className="mt-3 rounded-xl bg-primary/5 p-3">
                <code className="block break-all text-sm font-semibold text-primary-dark">
                  {o.voucherCode}
                </code>
              </div>
              <button
                onClick={() => copy(o.id, o.voucherCode ?? '')}
                className="btn-outline mt-3 w-full py-2"
              >
                {copied === o.id ? <Check size={16} /> : <Copy size={16} />}
                {copied === o.id ? 'Copied' : 'Copy Code'}
              </button>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
