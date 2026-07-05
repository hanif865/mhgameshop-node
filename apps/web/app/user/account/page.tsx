'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ name: string; phone: string | null; avatar: string | null }>('/api/user/profile').then(
      (res) => {
        const d = res.data as any;
        if (d) {
          setName(d.name ?? '');
          setPhone(d.phone ?? '');
          setAvatar(d.avatar ?? '');
        }
      },
    );
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: Record<string, unknown> = { name, phone: phone || null, avatar: avatar || null };
      if (password) body.password = password;
      const res = await apiPut('/api/user/profile', body);
      if (res.success) {
        toast.success('Profile updated.');
        setPassword('');
        await refresh();
      } else {
        toast.error(res.message || 'Update failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-slate-800">Account</h1>

      <form onSubmit={save} className="card max-w-lg space-y-4 p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-white">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (user?.name ?? 'U').charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">Avatar URL</label>
            <input className="input" value={avatar} onChange={(e) => setAvatar(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
          <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
          <input disabled className="input bg-slate-50" value={user?.email ?? ''} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Phone</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            New Password <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading ? <Loader2 className="animate-spin" /> : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
