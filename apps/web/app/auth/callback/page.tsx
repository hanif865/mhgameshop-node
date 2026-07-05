'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';

/**
 * Landing page after Google OAuth. The API already set the httpOnly cookie on
 * its own domain and redirected here; we just refresh the auth state and go home.
 */
export default function AuthCallback() {
  const { refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await refresh();
      router.replace('/user/orders');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="flex items-center gap-3 text-slate-500">
        <Loader2 className="animate-spin" /> Signing you in…
      </div>
    </div>
  );
}
