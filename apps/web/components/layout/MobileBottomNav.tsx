'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Home, Wallet, ShoppingBag, Ticket, User } from 'lucide-react';

const ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/user/add-funds', label: 'Add Money', icon: Wallet },
  { href: '/user/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/user/codes', label: 'Codes', icon: Ticket },
  { href: '/user/account', label: 'Account', icon: User },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                active ? 'text-primary-dark' : 'text-slate-400',
              )}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
