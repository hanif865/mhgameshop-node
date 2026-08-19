'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { UserSidebar } from '@/components/user/UserSidebar';
import { FbPurchaseOnReturn } from '@/components/FbPurchaseOnReturn';

export default function UserLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/auth/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="container-page flex gap-6 py-5">
      <FbPurchaseOnReturn />
      <UserSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
