'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  FileText,
  Settings,
  Gamepad2,
} from 'lucide-react';

const GROUPS: {
  label: string;
  icon: any;
  links: { href: string; label: string }[];
}[] = [
  {
    label: 'Catalog',
    icon: Boxes,
    links: [
      { href: '/categories', label: 'Categories' },
      { href: '/products', label: 'Products' },
      { href: '/variations', label: 'Variations' },
      { href: '/combos', label: 'Combo Packages' },
      { href: '/shells', label: 'Shells' },
      { href: '/vouchers', label: 'Vouchers' },
      { href: '/auto-vouchers', label: 'Auto Vouchers' },
    ],
  },
  {
    label: 'Management',
    icon: ShoppingCart,
    links: [
      { href: '/orders', label: 'Orders' },
      { href: '/users', label: 'Users' },
      { href: '/deposits', label: 'Deposits' },
      { href: '/transactions', label: 'Transactions' },
    ],
  },
  {
    label: 'Content',
    icon: FileText,
    links: [
      { href: '/sliders', label: 'Sliders' },
      { href: '/pages', label: 'Pages' },
    ],
  },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-4 font-extrabold text-primary-dark">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white">
          <Gamepad2 size={20} />
        </span>
        MH Admin
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={clsx(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
            isActive('/dashboard')
              ? 'bg-primary text-white'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <LayoutDashboard size={18} /> Dashboard
        </Link>

        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="flex items-center gap-2 px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <group.icon size={13} /> {group.label}
            </p>
            <div className="space-y-0.5">
              {group.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onNavigate}
                  className={clsx(
                    'block rounded-lg px-3 py-2 text-sm font-medium',
                    isActive(l.href)
                      ? 'bg-primary/10 text-primary-dark'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        ))}

        <Link
          href="/settings"
          onClick={onNavigate}
          className={clsx(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
            isActive('/settings') ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <Settings size={18} /> Settings
        </Link>
      </nav>
    </div>
  );
}
