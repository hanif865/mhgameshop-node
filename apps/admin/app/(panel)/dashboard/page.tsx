'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, DollarSign, Users, Clock } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { money, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';

interface Dashboard {
  orders: { today: number; week: number; month: number };
  revenue: { today: string; month: string; monthProfit: string };
  users: { total: number; newToday: number };
  pendingOrders: number;
  recentOrders: any[];
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    apiGet<Dashboard>('/api/admin/dashboard').then((res) => setData(res.data ?? null));
  }, []);

  const cards = [
    { label: "Today's Orders", value: data?.orders.today ?? '—', icon: ShoppingCart, tone: 'bg-primary/10 text-primary-dark' },
    { label: "Today's Revenue", value: data ? money(data.revenue.today) : '—', icon: DollarSign, tone: 'bg-accent/10 text-accent-dark' },
    { label: 'Total Users', value: data?.users.total ?? '—', icon: Users, tone: 'bg-blue-100 text-blue-700' },
    { label: 'Pending Orders', value: data?.pendingOrders ?? '—', icon: Clock, tone: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
