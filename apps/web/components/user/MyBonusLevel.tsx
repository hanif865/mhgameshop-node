import Link from 'next/link';
import { Award, Crown, Gem, Medal, type LucideIcon } from 'lucide-react';
import { money } from '@/lib/format';
import { TierBadge } from '@/components/ui/TierBadge';

// প্রোফাইলের "My Bonus & Level" কার্ড — presentational, ডেটা আসে GET /api/user/profile থেকে
// ({ totalSpent, level, levels })। লেভেল স্কিমের একমাত্র উৎস ব্যাকএন্ড utils/levels.ts।

type LevelName = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'premium';

interface LevelStep {
  index: number;
  name: LevelName;
  min: number;
  discountPercent: number;
}

interface CurrentLevel {
  index: number;
  name: LevelName;
  min: number;
  discountPercent: number;
  nextName: LevelName | null;
  nextMin: number | null;
  progressPercent: number;
}

// লেভেল কার্ডের আইকন — TierBadge-এর আইকন/রঙ স্কিমের সাথে মিল রেখে
const LEVEL_ICON: Record<string, LucideIcon> = {
  bronze: Medal,
  silver: Medal,
  gold: Award,
  platinum: Gem,
  premium: Crown,
};

const LABELS: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  premium: 'Premium',
};

export function MyBonusLevel({
  totalSpent,
  level,
  levels,
}: {
  totalSpent: number;
  level: CurrentLevel;
  levels: LevelStep[];
}) {
  const atMax = level.nextMin === null;
  const pct = Math.round(Math.min(100, Math.max(0, level.progressPercent)));

  return (
    <div className="card overflow-hidden">
      {/* সবুজ gradient হেডার */}
      <div className="bg-gradient-to-br from-primary to-primary-dark p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold leading-snug">যত বেশি টপ-আপ, তত বেশি ছাড়!</h2>
            <p className="mt-1 text-sm text-white/80">
              আপনার মোট টপ-আপ যত বাড়বে, লেভেল আর ছাড়ও তত বাড়বে।
            </p>
          </div>
          <div className="shrink-0">
            {level.name === 'none' ? (
              <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
                লেভেল নেই
              </span>
            ) : (
              <TierBadge tier={level.name} />
            )}
          </div>
        </div>

        {/* পরের লেভেলের অগ্রগতি */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-white/85">
            <span>
              {atMax
                ? 'সর্বোচ্চ লেভেলে পৌঁছেছেন 🎉'
                : level.name === 'none'
                  ? 'প্রথম লেভেলের পথে'
                  : 'পরের লেভেলের অগ্রগতি'}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-white/80">
            {money(totalSpent)}
            {!atMax && level.nextMin !== null && <> / {money(level.nextMin)}</>}
          </div>
        </div>
      </div>

      {/* ৫টা লেভেল কার্ড */}
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-5">
        {levels.map((lv) => {
          const Icon = LEVEL_ICON[lv.name] ?? Medal;
          const active = lv.index === level.index;
          return (
            <div
              key={lv.index}
              className={
                'relative rounded-xl border p-3 text-center ' +
                (active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-100 bg-white')
              }
            >
              {lv.index === 5 && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-white">
                  PREMIUM
                </span>
              )}
              <Icon size={22} className={'mx-auto ' + (active ? 'text-primary' : 'text-slate-400')} />
              <div className="mt-1 text-xs font-bold text-slate-700">{LABELS[lv.name] ?? lv.name}</div>
              <div className="text-[11px] text-slate-400">{money(lv.min)}</div>
              <div
                className={
                  'mt-0.5 text-[11px] font-semibold ' +
                  (lv.discountPercent > 0 ? 'text-primary' : 'text-slate-300')
                }
              >
                {lv.discountPercent > 0 ? `${lv.discountPercent}% ছাড়` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Your Top-up & Spending */}
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <div>
          <div className="text-xs text-slate-400">আপনার মোট টপ-আপ ও খরচ</div>
          <div className="text-base font-extrabold text-slate-800">{money(totalSpent)}</div>
        </div>
        <Link href="/user/transactions" className="text-sm font-semibold text-primary hover:underline">
          বিস্তারিত ›
        </Link>
      </div>
    </div>
  );
}
