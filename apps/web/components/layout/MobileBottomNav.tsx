'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Home, Wallet, ShoppingBag, Gift, User } from 'lucide-react';

// মাঝেরটা (Add Money) elevated সবুজ FAB; বাকি ৪টা সাধারণ ট্যাব। center দিয়ে আলাদা রেন্ডার।
const ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/user/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/user/add-funds', label: 'Add Money', icon: Wallet, center: true },
  { href: '/user/referral', label: 'Referrals', icon: Gift },
  { href: '/user/account', label: 'Profile', icon: User },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 overflow-visible border-t border-slate-100 bg-white/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5 items-end">
        {ITEMS.map(({ href, label, icon: Icon, center }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

          // মাঝের CTA — বৃত্তাকার FAB border-t-এর উপরে উঠে থাকে (ring-white halo দিয়ে ভাসমান দেখায়)
          if (center) {
            return (
              <Link key={href} href={href} className="flex flex-col items-center justify-end">
                <span className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-lg ring-4 ring-white transition-transform active:scale-95">
                  <Icon size={24} />
                </span>
                <span className="mt-0.5 pb-1 text-[11px] font-medium text-primary-dark">{label}</span>
              </Link>
            );
          }

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
