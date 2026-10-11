'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/format';

interface LikeSub {
  id: number;
  user_name: string | null;
  player_id: string;
  nickname: string | null;
  gateway: string | null;
  likes_per_day: number;
  total_days: number;
  days_sent: number;
  success_count: number;
  status: string;
  next_run_at: string;
  last_result: string | null;
  created_at: string;
}

export default function LikeSubscriptionsPage() {
  const [rows, setRows] = useState<LikeSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  function load() {
    setLoading(true);
    apiGet(`/api/admin/like-subscriptions?page=${page}&status=${status}`).then((res) => {
      const d = pageData<LikeSub>(res);
      setRows(d.items);
      setTotalPages(d.totalPages);
      setLoading(false);
    });
  }

  useEffect(load, [page, status]);

  async function cancel(id: number) {
    if (!confirm('এই সাবস্ক্রিপশনটি বাতিল করবেন? ভবিষ্যতের লাইক বন্ধ হয়ে যাবে।')) return;
    setBusy(id);
    const res = await apiPost(`/api/admin/like-subscriptions/${id}/cancel`);
    setBusy(null);
    if (res.success) load();
    else alert(res.message || 'Cancel failed.');
  }

  const columns: Column<LikeSub>[] = [
    { key: 'id', label: 'ID' },
    { key: 'user', label: 'User', render: (r) => r.user_name ?? '—' },
    {
      key: 'player',
      label: 'Player',
      render: (r) => (
        <span>
          {r.player_id}
          {r.nickname ? <span className="text-slate-400"> ({r.nickname})</span> : null}
        </span>
      ),
    },
    {
      key: 'package',
      label: 'Package',
      render: (r) => `${r.likes_per_day} likes/day × ${r.total_days}d`,
    },
    {
      key: 'progress',
      label: 'Progress',
      render: (r) => (
        <span>
          {r.days_sent}/{r.total_days}
          <span className="text-slate-400"> · {r.success_count} ok</span>
        </span>
      ),
    },
    { key: 'gateway', label: 'Gateway', render: (r) => r.gateway ?? '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'next_run_at',
      label: 'Next run',
      render: (r) => (r.status === 'active' ? formatDate(r.next_run_at) : '—'),
    },
    {
      key: 'last_result',
      label: 'Last result',
      render: (r) => (
        <span className="text-xs text-slate-500" title={r.last_result ?? ''}>
          {r.last_result ? r.last_result.slice(0, 40) : '—'}
        </span>
      ),
    },
    {
      key: 'action',
      label: '',
      render: (r) =>
        r.status === 'active' ? (
          <button
            onClick={() => cancel(r.id)}
            disabled={busy === r.id}
            className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            {busy === r.id ? '...' : 'Cancel'}
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Like Subscriptions</h1>
      <p className="mb-5 text-sm text-slate-500">
        মাসিক/সাপ্তাহিক অটো-লাইক প্যাকেজ। প্রতিদিন ফিক্সড সময়ে (setting{' '}
        <code className="rounded bg-slate-100 px-1">like_sub_hour</code>, ডিফল্ট রাত ৪টা BD) লাইক
        যায়।
      </p>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        filters={[
          {
            value: status,
            onChange: (v) => {
              setPage(1);
              setStatus(v);
            },
            options: [
              { value: '', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ],
          },
        ]}
      />
    </div>
  );
}
