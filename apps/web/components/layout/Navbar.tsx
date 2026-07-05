'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Wallet, Menu, Gamepad2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settings';
import { money } from '@/lib/format';
import { ProfileDrawer } from './ProfileDrawer';

export function Navbar() {
  const { user, loading } = useAuth();
  const { get } = useSettings();
  const [drawer, setDrawer] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
      <nav className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-primary-dark">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white">
            <Gamepad2 size={20} />
          </span>
          <span className="text-lg">{get('site_name', 'MH Game Shop')}</span>
        </Link>

        <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/" className="hover:text-primary-dark">
            Home
          </Link>
          <Link href="/#products" className="hover:text-primary-dark">
            Products
          </Link>
          <Link href="/user/orders" className="hover:text-primary-dark">
            My Orders
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {!loading && user ? (
            <>
              <Link
                href="/user/add-funds"
                className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary-dark"
              >
                <Wallet size={16} />
                {money(user.balance)}
              </Link>
              <button
                onClick={() => setDrawer(true)}
                className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-primary/20 bg-primary/5 font-bold text-primary-dark"
              >
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </button>
            </>
          ) : !loading ? (
            <>
              <Link href="/auth/login" className="btn-outline hidden px-4 py-2 sm:inline-flex">
                Login
              </Link>
              <Link href="/auth/register" className="btn-primary px-4 py-2">
                Sign up
              </Link>
            </>
          ) : (
            <div className="h-9 w-24 animate-pulse rounded-full bg-slate-100" />
          )}
          <button className="md:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
            <Menu />
          </button>
        </div>
      </nav>

      <ProfileDrawer open={drawer} onClose={() => setDrawer(false)} />
    </header>
  );
}
