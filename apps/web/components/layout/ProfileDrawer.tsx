'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  X,
  LayoutGrid,
  ShoppingBag,
  Ticket,
  Wallet,
  ArrowLeftRight,
  Gift,
  Sparkles,
  Video,
  User as UserIcon,
  LogOut,
  LogIn,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';

const LINKS = [
  { href: '/', label: 'Home', icon: LayoutGrid },
  { href: '/user/orders', label: 'My Orders', icon: ShoppingBag },
  { href: '/user/codes', label: 'My Codes', icon: Ticket },
  { href: '/user/add-funds', label: 'Add Funds', icon: Wallet },
  { href: '/user/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/user/referral', label: 'Refer & Earn', icon: Gift },
  { href: '/user/spin', label: 'Spin & Win', icon: Sparkles },
  { href: '/user/creator', label: 'Creator Program', icon: Video },
  { href: '/user/account', label: 'Account', icon: UserIcon },
];

export function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  // Keep mounted briefly for the close animation, then unmount entirely so the
  // drawer can never be left visible (robust against any CSS/cache issue).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function handleLogout() {
    await logout();
    onClose();
    router.push('/');
  }

  if (!mounted && !open) return null;

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-50 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
      />
      <aside
        className={clsx(
          'fixed right-0 top-0 z-50 flex w-80 max-w-[85%] flex-col shadow-2xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ backgroundColor: '#ffffff', height: '100dvh' }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <span className="font-bold text-primary-dark">Menu</span>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        {user && (
          <div
            className="flex items-center gap-3 border-b border-slate-100 p-4"
            style={{ backgroundColor: '#ecfdf5' }}
          >
            <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-primary text-white font-bold">
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-800">{user.name}</p>
              <p className="text-sm font-bold text-primary-dark">{money(user.balance)}</p>
            </div>
          </div>
        )}

        <nav
          className="space-y-1 overflow-y-auto p-3"
          style={{ backgroundColor: '#ffffff' }}
        >
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-700 hover:bg-primary/5 hover:text-primary-dark"
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3" style={{ backgroundColor: '#ffffff' }}>
          {user ? (
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-red-600 hover:bg-red-50"
            >
              <LogOut size={18} />
              Logout
            </button>
          ) : (
            <Link
              href="/auth/login"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-primary-dark hover:bg-primary/5"
            >
              <LogIn size={18} />
              Login
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
