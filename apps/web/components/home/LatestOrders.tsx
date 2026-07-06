import { Badge } from '@/components/ui/Badge';
import { money, shortDate } from '@/lib/format';

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
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
        <span className="h-5 w-1.5 rounded-full bg-gold" />
        Latest Orders
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {orders.map((o) => (
          <div key={o.id} className="card flex items-center gap-3 p-3">
            {/* Customer avatar (Google photo) */}
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 font-bold text-primary-dark">
              {o.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                o.user.charAt(0).toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-800">{o.user}</p>
              <p className="truncate text-xs text-slate-500">{o.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{shortDate(o.createdAt)}</p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-bold text-primary-dark">{money(o.amount)}</span>
              <Badge status={o.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
