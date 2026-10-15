'use client';

import { useEffect, useState } from 'react';
import { Loader2, Heart } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/format';

interface LikeSub {
  id: number;
  player_id: string;
  nickname: string | null;
  likes_per_day: number;
  total_days: number;
  days_sent: number;
  success_count: number;
  status: string;
  next_run_at: string;
  last_run_at: string | null;
  last_result: string | null;
  created_at: string;
}

export default function LikeSubscriptionsPage() {
  const [items, setItems] = useState<LikeSub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ items: LikeSub[] }>(`/api/user/like-subscriptions`).then((res) => {
      const d = res.data as any;
      setItems(d?.items ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-xl font-extrabold text-slate-800">My Like Subscriptions</h1>
      <p className="mb-4 text-sm text-slate-500">
        প্রতিদিন আপনার Free Fire অ্যাকাউন্টে অটো-লাইক যায়। নিচে প্রতিটি প্যাকেজের অগ্রগতি দেখুন।
      </p>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="কোনো লাইক সাবস্ক্রিপশন নেই।"
          subtitle="লাইক প্যাকেজ কিনলে এখানে অগ্রগতি দেখা যাবে।"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((s) => {
            const pct = Math.min(100, Math.round((s.days_sent / Math.max(1, s.total_days)) * 100));
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-400">Subscription #{s.id}</p>
                    <p className="font-semibold text-slate-800">
                      {s.likes_per_day} likes/day × {s.total_days} days
                    </p>
                  </div>
                  <Badge status={s.status} />
                </div>

                <dl className="mt-3 space-y-1 text-sm">
                  <Row
                    label="Player ID"
                    value={s.player_id + (s.nickname ? ` (${s.nickname})` : '')}
                  />
                  <Row label="Days sent" value={`${s.days_sent} / ${s.total_days}`} />
                  <Row label="Delivered" value={`${s.success_count} দিন`} />
                  {s.status === 'active' && (
                    <Row label="Next delivery" value={formatDate(s.next_run_at)} />
                  )}
                  {s.last_result && <Row label="Last result" value={s.last_result} />}
                </dl>

                {/* Progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-slate-400">{pct}%</p>
              </div>
            );
          })}
        </div>
      )}
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
