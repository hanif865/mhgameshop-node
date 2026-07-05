'use client';

import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';
import { useSettings } from '@/lib/settings';

export function Footer() {
  const { get } = useSettings();
  return (
    <footer className="mt-12 border-t border-slate-100 bg-white pb-24 pt-10 md:pb-10">
      <div className="container-page grid gap-8 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 font-extrabold text-primary-dark">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white">
              <Gamepad2 size={20} />
            </span>
            {get('site_name', 'MH Game Shop')}
          </div>
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            {get('site_description', 'Fast & reliable game top-up, vouchers and subscriptions.')}
          </p>
        </div>
        <div>
          <h4 className="mb-3 font-bold text-slate-800">Quick Links</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            <li><Link href="/" className="hover:text-primary-dark">Home</Link></li>
            <li><Link href="/user/orders" className="hover:text-primary-dark">My Orders</Link></li>
            <li><Link href="/user/add-funds" className="hover:text-primary-dark">Add Funds</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-bold text-slate-800">Support</h4>
          <p className="text-sm text-slate-500">{get('support_time', 'Support: 10 AM – 10 PM')}</p>
        </div>
      </div>
      <div className="container-page mt-8 border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {get('site_name', 'MH Game Shop')}. All rights reserved.
      </div>
    </footer>
  );
}
