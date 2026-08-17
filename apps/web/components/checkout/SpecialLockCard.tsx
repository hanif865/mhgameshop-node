'use client';

import Link from 'next/link';
import { Lock, LogIn } from 'lucide-react';
import { money } from '@/lib/format';

// স্পেশাল (লকড) প্রোডাক্টের আনলক-প্রোগ্রেস কার্ড — সবুজ থিম (MyBonusLevel টেমপ্লেট)।
// buy-grid-এর বদলে Checkout.tsx এটি দেখায় যখন প্রোডাক্ট লক থাকে।
// এটি শুধু UX; আসল অর্ডার-ব্লক হয় ব্যাকএন্ডে (order.service.ts)।

export function SpecialLockCard({
  threshold,
  spend,
  loading,
  loggedIn,
}: {
  threshold: number;
  spend: number | null;
  loading: boolean;
  loggedIn: boolean;
}) {
  const spent = spend ?? 0;
  const pct = threshold > 0 ? Math.round(Math.min(100, Math.max(0, (spent / threshold) * 100))) : 0;
  const need = Math.max(0, Math.ceil(threshold - spent));

  return (
    <div className="card relative overflow-hidden">
      {/* "বিশেষ অফার" রিবন */}
      <span className="absolute right-0 top-4 z-10 rounded-l-full bg-gold px-3 py-1 text-xs font-bold text-white shadow">
        বিশেষ অফার
      </span>

      {/* সবুজ gradient হেডার */}
      <div className="bg-gradient-to-br from-primary to-primary-dark p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20">
            <Lock size={20} />
          </span>
          <h2 className="pr-16 text-lg font-extrabold leading-snug">
            এই প্রোডাক্টটি শুধু বিশেষ ইউজারদের জন্য আনলক হবে
          </h2>
        </div>
        <p className="mt-3 text-sm text-white/85">
          আপনার একাউন্ট থেকে মোট {money(threshold)} বা তার বেশি টপআপ করলেই এই অফারটি আপনার জন্য
          স্থায়ীভাবে আনলক হয়ে যাবে।
        </p>
      </div>

      <div className="p-5">
        {loggedIn ? (
          <>
            {/* দুই স্ট্যাট বক্স */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                <div className="text-xs text-slate-400">আপনার মোট খরচ</div>
                <div className="mt-0.5 text-lg font-extrabold text-primary-dark">
                  {loading ? '…' : money(spent)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                <div className="text-xs text-slate-400">আনলক টার্গেট</div>
                <div className="mt-0.5 text-lg font-extrabold text-slate-700">{money(threshold)}</div>
              </div>
            </div>

            {/* প্রোগ্রেস বার */}
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>অগ্রগতি</span>
                <span>{loading ? '…' : `${pct}%`}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all"
                  style={{ width: `${loading ? 0 : pct}%` }}
                />
              </div>
            </div>

            {/* ফুটার */}
            {!loading && (
              <p className="mt-4 rounded-xl bg-primary/5 px-4 py-3 text-center text-sm font-semibold text-primary-dark">
                আরও {money(need)} টপআপ করলেই ভিআইপি এক্সেস আনলক হবে! 🔓
              </p>
            )}
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
              <div className="text-xs text-slate-400">আনলক টার্গেট</div>
              <div className="mt-0.5 text-lg font-extrabold text-slate-700">{money(threshold)}</div>
            </div>
            <p className="mt-3 text-center text-sm text-slate-500">
              নিজের অগ্রগতি দেখতে লগইন করুন।
            </p>
            <Link href="/auth/login" className="btn-primary mt-3 w-full py-2.5">
              <LogIn size={18} /> Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
