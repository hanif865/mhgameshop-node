'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Gamepad2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';

/**
 * Landing page after Google OAuth. The API already set the httpOnly cookie on
 * its own domain and redirected here; we refresh the auth state and go home.
 *
 * নতুন গুগল-ইউজার হলে (?new=1) এবং স্পিন চালু ও করা যাবে হলে — welcome পপ-আপসহ
 * স্পিন পেজে পাঠাই (ইমেইল রেজিস্ট্রেশনের মতোই)।
 */
export default function AuthCallback() {
  const { refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await refresh();
      const isNew = new URLSearchParams(window.location.search).get('new') === '1';
      if (isNew) {
        try {
          const sp = await apiGet<{ enabled: boolean; canSpin: boolean }>('/api/user/spin');
          if (sp.data?.enabled && sp.data?.canSpin) {
            router.replace('/user/spin?welcome=1');
            return;
          }
        } catch {
          /* স্পিন না পেলেও লগইন আটকাবে না */
        }
      }
      router.replace('/user/orders');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-white shadow-card">
        <Gamepad2 size={28} />
      </span>
      <div className="flex items-center gap-2 text-slate-600">
        <Loader2 className="animate-spin text-primary" size={18} /> Signing you in…
      </div>
    </div>
  );
}
