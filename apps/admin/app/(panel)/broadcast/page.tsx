'use client';

import { useEffect, useState } from 'react';
import { Send, Loader2, Users } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

export default function BroadcastPage() {
  const toast = useToast();
  const [reach, setReach] = useState<{ reachable: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  useEffect(() => {
    apiGet<{ reachable: number; total: number }>('/api/admin/broadcast').then((r) => setReach(r.data ?? null));
  }, []);

  async function send() {
    if (!message.trim()) return toast.error('Write a message first.');
    const who = user.trim() ? `to ${user.trim()}` : `to all ${reach?.reachable ?? 0} users`;
    if (!confirm(`Send this message ${who}?\n\nThis cannot be undone.`)) return;

    setSending(true);
    setResult(null);
    const res = await apiPost<{ sent: number; failed: number; total: number }>('/api/admin/broadcast', {
      message: message.trim(),
      ...(user.trim() ? { user: user.trim() } : {}),
    });
    setSending(false);
    if (res.success && res.data) {
      setResult(res.data);
      toast.success(res.message || 'Sent.');
      setMessage('');
    } else toast.error(res.message || 'Failed.');
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Telegram Broadcast</h1>
        <p className="text-sm text-slate-500">Push a message to customers through the Telegram bot.</p>
      </div>

      <div className="card mb-4 flex items-center gap-3 p-4">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-700"><Users size={20} /></span>
        <div>
          <p className="text-sm text-slate-400">Reachable (Telegram linked)</p>
          <p className="text-xl font-extrabold text-slate-800">
            {reach ? `${reach.reachable} of ${reach.total}` : '—'}
          </p>
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <div>
          <label className="label">Message</label>
          <textarea
            className="input h-40"
            placeholder={'🎉 আজ বিশেষ ছাড়!\n\nWeekly প্যাকেজ এখন ৳150 — সীমিত সময়ের জন্য।'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            HTML allowed: &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, &lt;code&gt;code&lt;/code&gt;, &lt;a href=&quot;…&quot;&gt;link&lt;/a&gt;
          </p>
        </div>

        <div>
          <label className="label">Send to one user only (optional)</label>
          <input
            className="input"
            placeholder="Email, user id, or telegram id — leave blank for everyone"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </div>

        <button onClick={send} disabled={sending} className="btn-primary">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {user.trim() ? 'Send to user' : 'Send to everyone'}
        </button>

        {result && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-green-600">Delivered: {result.sent}</p>
            {result.failed > 0 && (
              <p className="text-amber-600">
                Failed: {result.failed} — they likely blocked the bot or never pressed Start.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
