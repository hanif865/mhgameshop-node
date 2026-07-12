import { Badge } from '@/components/ui/Badge';
import { money } from '@/lib/format';

interface LatestOrder {
  id: number;
  title: string;
  user: string;
  avatar: string | null;
  amount: string;
  status: string;
  createdAt: string;
}

export function LatestOrders({ orders }: { orders: LatestOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <section>
      <h2 className="text-center text-lg font-bold text-slate-800">Latest Orders</h2>
      <p className="mb-4 text-center text-xs text-slate-400">
        Last updated <span className="font-semibold text-primary">just now</span>
      </p>

      <div className="mx-auto max-w-xl space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="card flex items-center gap-3 px-3 py-2.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary-dark">
              {o.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                o.user.charAt(0).toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{o.user}</p>
              <p className="truncate text-xs text-slate-500">
                {o.title} · <span className="font-bold text-primary-dark">{money(o.amount)}</span>
              </p>
            </div>

            <Badge status={o.status} />
          </div>
        ))}
      </div>
    </section>
  );
}
