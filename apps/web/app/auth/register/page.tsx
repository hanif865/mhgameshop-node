'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Gamepad2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/lib/settings';
import { API_URL, imageUrl } from '@/lib/config';
import { apiGet } from '@/lib/api';
import { fbTrack } from '@/lib/fbpixel';

export default function RegisterPage() {
  const { register } = useAuth();
  const { get } = useSettings();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // রেফার কোড URL থেকে (?ref=XXXXXX)
  const [ref, setRef] = useState('');
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('ref');
    if (v) setRef(v.trim().toUpperCase());
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name, email, password, ref || undefined);
      fbTrack('CompleteRegistration');
      toast.success('Account created!');
      // নতুন ইউজার — স্পিন অফার চালু ও করা যাবে হলে welcome পপ-আপসহ স্পিন পেজে
      try {
        const sp = await apiGet<{ enabled: boolean; canSpin: boolean }>('/api/user/spin');
        if (sp.data?.enabled && sp.data?.canSpin) {
          router.push('/user/spin?welcome=1');
          return;
        }
      } catch {
        /* স্পিন না পেলেও রেজিস্ট্রেশন আটকাবে না */
      }
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
            Create <span className="text-primary-dark">account</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Join MH Game Shop in seconds.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
            <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
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
              minLength={6}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? <Loader2 className="animate-spin" /> : 'Sign up'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" /> OR <div className="h-px flex-1 bg-slate-200" />
        </div>

        <a href={`${API_URL}/api/auth/google`} className="btn-outline w-full py-2.5">
          <GoogleIcon /> Continue with Google
        </a>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-primary-dark">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.7 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z" />
      <path fill="#FBBC05" d="M10.3 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.8 2.1-6.4 0-11.8-3.7-13.7-9.1l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
