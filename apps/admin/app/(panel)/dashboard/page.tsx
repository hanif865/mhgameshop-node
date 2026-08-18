'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, DollarSign, Clock, Wifi, Eye } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { money, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { useAdminSocket } from '@/lib/socket';

interface Dashboard {
  orders: { today: number; week: number; month: number };
  revenue: { today: string; month: string; monthProfit: string };
  users: { total: number; newToday: number; online: number };
  pendingOrders: number;
  recentOrders: any[];
}

interface OnlineUser {
  id: number;
  name: string;
  email: string;
  role: string;
  balance: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [guests, setGuests] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [who, setWho] = useState<OnlineUser[]>([]);

  async function loadOnline() {
    const res = await apiGet<{ count: number; guests: number; users: OnlineUser[] }>(
      '/api/admin/dashboard/online',
    );
    if (res.data) {
      setOnline(res.data.count);
      setGuests(res.data.guests);
      setWho(res.data.users);
    }
  }

  useEffect(() => {
    apiGet<Dashboard>('/api/admin/dashboard').then((res) => setData(res.data ?? null));
    loadOnline();
  }, []);

  // কেউ ঢুকলে/বেরোলে সাথে সাথে সংখ্যা বদলায়, আর নামের তালিকাও নতুন করে আনি
  useAdminSocket({
    onOnline: (e) => {
      setOnline(e.count);
      setGuests(e.guests);
      loadOnline();
    },
    onPending: setPending,
  });

  const cards = [
    { label: "Today's Orders", value: data?.orders.today ?? '—', icon: ShoppingCart, tone: 'bg-primary/10 text-primary-dark' },
    { label: "Today's Revenue", value: data ? money(data.revenue.today) : '—', icon: DollarSign, tone: 'bg-accent/10 text-accent-dark' },
    { label: 'Online Users', value: online ?? '—', icon: Wifi, tone: 'bg-green-100 text-green-700' },
    { label: 'Guests Now', value: guests ?? '—', icon: Eye, tone: 'bg-purple-100 text-purple-700' },
    { label: 'Pending Orders', value: pending ?? data?.pendingOrders ?? '—', icon: Clock, tone: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card flex items-center gap-4 p-5">
            <span className={`grid h-12 w-12 place-items-center rounded-xl ${c.tone}`}>
              <c.icon size={22} />
            </span>
            <div>
              <p className="text-sm text-slate-400">{c.label}</p>
              <p className="text-xl font-extrabold text-slate-800">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* এখন কারা অনলাইন — নাম সহ */}
      <div className="mt-6 card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          Who&apos;s Online
          <span className="text-sm font-normal text-slate-400">
            {online ?? 0} logged in · {guests ?? 0} guests
          </span>
        </h2>
        {who.length === 0 ? (
          <p className="text-sm text-slate-400">No logged-in users online right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {who.map((u) => (
              <div key={u.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <div className="leading-tight">
                  <p className="text-sm font-medium text-slate-800">
                    {u.name}
                    {u.role === 'admin' && <span className="ml-1 text-xs text-primary-dark">(admin)</span>}
                  </p>
                  <p className="text-xs text-slate-400">{u.email} · {money(u.balance)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 card overflow-hidden">
        <div className="border-b border-slate-100 p-4 font-bold text-slate-800">Recent Orders</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">ID</th>
                <th className="th">User</th>
                <th className="th">Package</th>
                <th className="th">Amount</th>
                <th className="th">Status</th>
                <th className="th">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.recentOrders ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="td font-medium">#{o.id}</td>
                  <td className="td">{o.user?.name ?? '—'}</td>
                  <td className="td">{o.variation?.title ?? o.comboPackage?.title ?? o.product?.title ?? '—'}</td>
                  <td className="td font-semibold">{money(o.amount)}</td>
                  <td className="td"><StatusBadge status={o.status} /></td>
                  <td className="td text-slate-400">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
              {data && data.recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="td py-8 text-center text-slate-400">No orders yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
