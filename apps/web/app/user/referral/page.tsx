'use client';

import { useEffect, useState } from 'react';
import { Gift, Copy, Check, Loader2, Users, Wallet } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { money } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

interface Referral {
  code: string;
  enabled: boolean;
  bonus: number;
  refereeBonus: number;
  minOrder: number;
  invited: number;
  rewarded: number;
  earned: number;
  referredBy: string | null;
  canApply: boolean;
  invitees: { id: number; name: string; created_at: string }[];
}

export default function ReferralPage() {
  const toast = useToast();
  const [d, setD] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);

  async function load() {
    const res = await apiGet<Referral>('/api/user/referral');
    setD(res.data ?? null);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const link = typeof window !== 'undefined' && d ? `${window.location.origin}/auth/register?ref=${d.code}` : '';

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Copy failed — select and copy manually.');
    }
  }

  async function apply() {
    if (!code.trim()) return toast.error('Enter a code.');
    setApplying(true);
    const res = await apiPost('/api/user/referral', { code: code.trim() });
    setApplying(false);
    if (res.success) {
      toast.success('Referral applied!');
      setCode('');
      load();
    } else toast.error(res.message || 'Could not apply this code.');
  }

  if (loading)
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );

  if (!d?.enabled)
    return (
      <div className="card p-8 text-center">
        <Gift className="mx-auto mb-3 text-slate-300" size={40} />
        <p className="font-semibold text-slate-700">Referral program is currently off.</p>
        <p className="text-sm text-slate-400">Please check back later.</p>
      </div>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Refer &amp; Earn</h1>
        <p className="text-sm text-slate-500">
          Share your link — when a friend places their first order, you earn a bonus.
        </p>
      </div>

      {/* কত পাবেন */}
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="rounded-xl bg-primary/5 p-4">
          <p className="text-sm text-slate-500">You earn</p>
          <p className="text-2xl font-extrabold text-primary-dark">{money(d.bonus)}</p>
          <p className="text-xs text-slate-400">
            when your friend completes their first order
            {d.minOrder > 0 && ` of ${money(d.minOrder)} or more`}
          </p>
        </div>
        <div className="rounded-xl bg-accent/5 p-4">
          <p className="text-sm text-slate-500">Your friend gets</p>
          <p className="text-2xl font-extrabold text-accent-dark">{money(d.refereeBonus)}</p>
          <p className="text-xs text-slate-400">instantly on sign-up</p>
        </div>
      </div>

      {/* কোড ও লিঙ্ক */}
      <div className="card space-y-3 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Your code</label>
          <div className="flex gap-2">
            <input readOnly value={d.code} className="input font-mono text-lg font-bold tracking-widest" />
            <button onClick={() => copy(d.code, 'code')} className="btn-primary px-4">
              {copied === 'code' ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Your link</label>
          <div className="flex gap-2">
            <input readOnly value={link} className="input text-sm" />
            <button onClick={() => copy(link, 'link')} className="btn-primary px-4">
              {copied === 'link' ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* পরিসংখ্যান */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-700"><Users size={20} /></span>
          <div>
            <p className="text-sm text-slate-400">Invited</p>
            <p className="text-xl font-extrabold text-slate-800">{d.invited}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-green-100 text-green-700"><Check size={20} /></span>
          <div>
            <p className="text-sm text-slate-400">Rewarded</p>
            <p className="text-xl font-extrabold text-slate-800">{d.rewarded}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-amber-700"><Wallet size={20} /></span>
          <div>
            <p className="text-sm text-slate-400">Earned</p>
            <p className="text-xl font-extrabold text-slate-800">{money(d.earned)}</p>
          </div>
        </div>
      </div>

      {/* কেউ রেফার করে থাকলে তার কোড বসানো */}
      {d.referredBy ? (
        <div className="card p-5">
          <p className="text-sm text-slate-500">
            You joined through <b className="text-slate-800">{d.referredBy}</b>.
          </p>
        </div>
      ) : d.canApply ? (
        <div className="card space-y-2 p-5">
          <p className="font-semibold text-slate-700">Have someone&apos;s code?</p>
          <p className="text-sm text-slate-500">
            Enter it before your first order to get {money(d.refereeBonus)}.
          </p>
          <div className="flex gap-2">
            <input
              className="input font-mono uppercase"
              placeholder="e.g. 5A2B9C"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button onClick={apply} disabled={applying} className="btn-primary px-5">
              {applying ? <Loader2 size={16} className="animate-spin" /> : 'Apply'}
            </button>
          </div>
        </div>
      ) : null}

      {/* কারা এসেছে */}
      {d.invitees?.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-bold text-slate-800">People you invited</h2>
          <div className="space-y-2">
            {d.invitees.map((u) => (
              <div key={u.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">{u.name}</span>
                <span className="text-slate-400">{new Date(u.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
