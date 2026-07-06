'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ShoppingBag, Ticket, Wallet, ArrowLeftRight, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';

const LINKS = [
  { href: '/user/orders', label: 'My Orders', icon: ShoppingBag },
  { href: '/user/codes', label: 'My Codes', icon: Ticket },
  { href: '/user/add-funds', label: 'Add Funds', icon: Wallet },
  { href: '/user/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/user/account', label: 'Account', icon: UserIcon },
];

export function UserSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="hidden w-64 shrink-0 md:block">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-primary text-white font-bold">
            {user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              (user?.name ?? 'U').charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{user?.name ?? '—'}</p>
            <p className="text-sm font-bold text-primary-dark">{money(user?.balance)}</p>
          </div>
        </div>
      </div>

      <nav className="card mt-4 space-y-1 p-3">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active
                  ? 'bg-primary text-white'
                  : 'text-slate-600 hover:bg-primary/5 hover:text-primary-dark',
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
