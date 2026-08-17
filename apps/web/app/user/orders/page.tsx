'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { money, formatDate } from '@/lib/format';
import { useOrderSocket } from '@/lib/socket';
import { useToast } from '@/components/ui/Toast';

interface Order {
  id: number;
  status: string;
  amount: string;
  createdAt: string;
  accountInfo: Record<string, string> | null;
  deliveryMessage: string | null;
  product: { title: string; type: string } | null;
  variation: { title: string } | null;
  comboPackage: { title: string } | null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    apiGet<{ items: Order[]; totalPages: number }>(`/api/user/orders?page=${page}`).then((res) => {
      const d = res.data as any;
      setOrders(d?.items ?? []);
      setTotalPages(d?.totalPages ?? 1);
      setLoading(false);
    });
  }, [page]);

  // Live status updates via Socket.io.
  useOrderSocket((e) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === e.id
          ? { ...o, status: e.status, deliveryMessage: e.deliveryMessage ?? o.deliveryMessage }
          : o,
      ),
    );
    toast.info(`Order #${e.id} is now ${e.status}`);
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-slate-800">My Orders</h1>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <p className="py-16 text-center text-slate-400">You have no orders yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o) => {
            const pkg = o.variation?.title ?? o.comboPackage?.title ?? o.product?.title ?? '—';
            return (
              <div key={o.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-400">Order #{o.id}</p>
                    <p className="font-semibold text-slate-800">{pkg}</p>
                  </div>
                  <Badge status={o.status} />
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <Row label="Date" value={formatDate(o.createdAt)} />
                  {accountEntries(o.accountInfo).map(([k, v]) => (
                    <Row key={k} label={prettifyKey(k)} value={v} />
                  ))}
                  <Row label="Price" value={money(o.amount)} />
                  {o.deliveryMessage && <Row label="Message" value={o.deliveryMessage} />}
                </dl>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}

// account_info-এর খালি নয় এমন সব ফিল্ড দেখাই (player_id + কাস্টম ফিল্ড)।
function accountEntries(ai: Record<string, string> | null): [string, string][] {
  if (!ai) return [];
  return Object.entries(ai).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== '',
  ) as [string, string][];
}

function prettifyKey(k: string): string {
  if (k === 'player_id') return 'Player ID';
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
