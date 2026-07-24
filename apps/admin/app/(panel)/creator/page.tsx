'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, X, ExternalLink } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/ui/Toast';

interface Submission {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  platform: string;
  url: string;
  views: number | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  bonus: number;
  admin_note: string | null;
  created_at: string;
}

const TABS = ['pending', 'approved', 'rejected', ''] as const;
const LABEL: Record<string, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', '': 'All' };

export default function CreatorPage() {
  const toast = useToast();
  const [tab, setTab] = useState<string>('pending');
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<{ s: Submission; action: 'approve' | 'reject' } | null>(null);
  const [bonus, setBonus] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet<Submission[]>(`/api/admin/creator?status=${tab}`);
    setRows(res.data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function open(s: Submission, action: 'approve' | 'reject') {
    setBonus('');
    setNote('');
    setReview({ s, action });
  }

  async function submit() {
    if (!review) return;
    if (review.action === 'approve' && !(Number(bonus) > 0)) return toast.error('Enter a bonus amount.');
    setSaving(true);
    const res = await apiPost(`/api/admin/creator/${review.s.id}/review`, {
      action: review.action,
      ...(review.action === 'approve' ? { bonus: Number(bonus) } : {}),
      note: note || null,
    });
    setSaving(false);
    if (res.success) {
      toast.success(review.action === 'approve' ? 'Approved & bonus paid.' : 'Rejected.');
      setReview(null);
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const badge = (s: string) =>
    s === 'approved'
      ? 'bg-green-100 text-green-700'
      : s === 'rejected'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700';

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Creator Submissions</h1>
        <p className="text-sm text-slate-500">Review video reviews and pay the bonus you decide.</p>
      </div>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? 'btn-primary px-4 py-1.5 text-sm' : 'btn-ghost px-4 py-1.5 text-sm'}
          >
            {LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-slate-500">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{s.user_name}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge(s.status)}`}>{s.status}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{s.platform}</span>
                  </div>
                  <p className="text-xs text-slate-400">{s.user_email}</p>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex items-center gap-1 break-all text-sm text-primary-dark hover:underline"
                  >
                    {s.url} <ExternalLink size={12} />
                  </a>
                  {s.views != null && <p className="text-xs text-slate-500">Claimed views: {s.views.toLocaleString()}</p>}
                  {s.note && <p className="mt-1 text-sm text-slate-600">“{s.note}”</p>}
                  {s.status === 'approved' && (
                    <p className="mt-1 text-sm font-semibold text-green-600">Paid ৳{s.bonus.toFixed(2)}</p>
                  )}
                  {s.admin_note && <p className="mt-1 text-xs text-slate-400">Note: {s.admin_note}</p>}
                </div>

                {s.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => open(s, 'approve')} className="btn-primary px-3 py-1.5 text-sm">
                      <Check size={14} /> Approve
                    </button>
                    <button onClick={() => open(s, 'reject')} className="btn-danger px-3 py-1.5 text-sm">
                      <X size={14} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={review?.action === 'approve' ? 'Approve & pay bonus' : 'Reject submission'}
      >
        {review && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              {review.s.user_name} — <span className="break-all">{review.s.url}</span>
            </p>
            {review.action === 'approve' && (
              <div>
                <label className="label">Bonus ৳ (goes straight to their wallet)</label>
                <input
                  type="number"
                  className="input"
                  value={bonus}
                  onChange={(e) => setBonus(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            <div>
              <label className="label">{review.action === 'approve' ? 'Note (optional)' : 'Reason'}</label>
              <textarea className="input h-20" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setReview(null)} className="btn-ghost">Cancel</button>
              <button
                onClick={submit}
                disabled={saving}
                className={review.action === 'approve' ? 'btn-primary' : 'btn-danger'}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : review.action === 'approve' ? 'Approve & Pay' : 'Reject'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
