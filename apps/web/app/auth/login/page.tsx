'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Gamepad2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/lib/settings';
import { imageUrl } from '@/lib/config';
import GoogleButton from '@/components/auth/GoogleButton';

export default function LoginPage() {
  const { login } = useAuth();
  const { get } = useSettings();
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
      router.push('/user/orders');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-8">
      <div className="card w-full max-w-md p-7">
        <div className="mb-6 flex flex-col items-center text-center">
          {get('site_logo') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl(get('site_logo'))}
              alt={get('site_name', 'MH Game Shop')}
              className="h-12 w-auto object-contain"
            />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-white shadow-card">
              <Gamepad2 size={28} />
            </span>
          )}
          <h1 className="mt-3 text-2xl font-extrabold text-slate-800">
            Welcome <span className="text-primary-dark">back</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Log in to continue to MH Game Shop.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? <Loader2 className="animate-spin" /> : 'Log in'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" /> OR <div className="h-px flex-1 bg-slate-200" />
        </div>

        <GoogleButton />

        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{' '}
          <Link href="/auth/register" className="font-semibold text-primary-dark">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
