'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Gamepad2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';

export default function AdminLogin() {
  const { login } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-2 font-extrabold text-primary-dark">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-white">
            <Gamepad2 size={22} />
          </span>
          MH Admin
        </div>
        <h1 className="text-xl font-bold text-slate-800">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Administrator access only.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? <Loader2 className="animate-spin" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
