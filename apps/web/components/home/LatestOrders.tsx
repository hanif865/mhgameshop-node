import { Badge } from '@/components/ui/Badge';
import { shortDate } from '@/lib/format';

interface LatestOrder {
  id: number;
  title: string;
  user: string;
  status: string;
  createdAt: string;
}

export function LatestOrders({ orders }: { orders: LatestOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-slate-800">Latest Orders</h2>
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-700">{o.title}</p>
              <p className="text-xs text-slate-400">
                {o.user} · {shortDate(o.createdAt)}
              </p>
            </div>
            <Badge status={o.status} />
          </div>
        ))}
      </div>
    </section>
  );
}
