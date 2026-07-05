'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Menu, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import { AdminSidebar } from './AdminSidebar';

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <AdminSidebar />
      </aside>

      {/* Mobile drawer */}
      <div
        className={clsx('fixed inset-0 z-50 lg:hidden', mobileOpen ? '' : 'pointer-events-none')}
      >
        <div
          className={clsx('absolute inset-0 bg-slate-900/40 transition-opacity', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={clsx(
            'absolute left-0 top-0 h-full w-64 bg-white transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <AdminSidebar onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">{user.name}</span>
            <button onClick={handleLogout} className="btn-ghost px-2 py-1.5">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
