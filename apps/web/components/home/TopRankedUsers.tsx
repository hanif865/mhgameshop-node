import { TierBadge } from '@/components/ui/TierBadge';
import { money } from '@/lib/format';

export interface TopUser {
  rank: number;
  user: string;
  avatar: string | null;
  total: number;
  tier: string;
}

// র‍্যাঙ্ক chip রঙ: top-3 কে হালকা হাইলাইট, বাকিরা নিরপেক্ষ।
function rankClass(rank: number): string {
  if (rank === 1) return 'bg-gold/15 text-gold';
  if (rank === 2) return 'bg-slate-200 text-slate-600';
  if (rank === 3) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-400';
}

// LatestOrders-এর হুবহু গঠন (avatar + নাম card row); disabled/খালি হলে সেকশন হাইড।
export function TopRankedUsers({ users }: { users: TopUser[] }) {
  if (users.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 flex items-center justify-center gap-2 text-lg font-bold text-slate-800">
        <span className="h-5 w-1.5 rounded-full bg-gold" />
        Top Ranked Users
      </h2>

      <div className="mx-auto max-w-xl space-y-2">
        {users.map((u) => (
          <div key={u.rank} className="card flex items-center gap-3 px-3 py-2.5">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${rankClass(u.rank)}`}
            >
              {u.rank}
            </span>

            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary-dark">
              {u.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                u.user.charAt(0).toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{u.user}</p>
              <p className="truncate text-xs font-bold text-primary-dark">{money(u.total)}</p>
            </div>

            <TierBadge tier={u.tier} />
          </div>
        ))}
      </div>
    </section>
  );
}
