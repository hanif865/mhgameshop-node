'use client';

import { useEffect, useState } from 'react';
import { Video, Loader2, ExternalLink, Wallet } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { money } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

interface Item {
  id: number;
  platform: string;
  url: string;
  views: number | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  bonus: number;
  admin_note: string | null;
  created_at: string;
}
interface Data {
  enabled: boolean;
  rules: string;
  earned: number;
  items: Item[];
}

export default function CreatorPage() {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [views, setViews] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await apiGet<Data>('/api/user/creator');
    setD(res.data ?? null);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!url.trim()) return toast.error('Paste your video link.');
    setSaving(true);
    const res = await apiPost('/api/user/creator', {
      url: url.trim(),
      views: views ? Number(views) : null,
      note: note || null,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Submitted — we will review it soon.');
      setUrl('');
      setViews('');
      setNote('');
      load();
    } else toast.error(res.message || 'Could not submit.');
  }

  const badge = (s: string) =>
    s === 'approved'
      ? 'bg-green-100 text-green-700'
      : s === 'rejected'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700';

  if (loading)
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );

  if (!d?.enabled)
    return (
      <div className="card p-8 text-center">
        <Video className="mx-auto mb-3 text-slate-300" size={40} />
        <p className="font-semibold text-slate-700">Creator program is currently off.</p>
        <p className="text-sm text-slate-400">Please check back later.</p>
      </div>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Creator Program</h1>
        <p className="text-sm text-slate-500">
          Make a review video about us, submit the link, and earn a bonus once approved.
        </p>
      </div>

      {d.earned > 0 && (
        <div className="card flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-amber-700"><Wallet size={20} /></span>
          <div>
            <p className="text-sm text-slate-400">Total earned</p>
            <p className="text-xl font-extrabold text-slate-800">{money(d.earned)}</p>
          </div>
        </div>
      )}

      {d.rules && (
        <div className="card p-5">
          <h2 className="mb-2 font-bold text-slate-800">Rules</h2>
          <p className="whitespace-pre-line text-sm text-slate-600">{d.rules}</p>
        </div>
      )}

      <div className="card space-y-3 p-5">
        <h2 className="font-bold text-slate-800">Submit a video</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Video link</label>
          <input
            className="input"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Views (optional)</label>
            <input type="number" className="input" value={views} onChange={(e) => setViews(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Note (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <button onClick={submit} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : 'Submit for review'}
        </button>
      </div>

      {d.items.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-bold text-slate-800">My submissions</h2>
          <div className="space-y-3">
            {d.items.map((i) => (
              <div key={i.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge(i.status)}`}>{i.status}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{i.platform}</span>
                  {i.status === 'approved' && (
                    <span className="text-sm font-semibold text-green-600">+{money(i.bonus)}</span>
                  )}
                </div>
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 break-all text-sm text-primary-dark hover:underline"
                >
                  {i.url} <ExternalLink size={12} />
                </a>
                {i.admin_note && <p className="mt-1 text-xs text-slate-500">Admin: {i.admin_note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
