import clsx from 'clsx';
import { Crown, Gem, Award, Medal, type LucideIcon } from 'lucide-react';

// tier স্ট্রিং → লেবেল + lucide আইকন + রঙ। tier-এর একমাত্র উৎস ব্যাকএন্ড
// (utils/levels.ts এর levelFor); এখানে শুধু presentation ম্যাপ। reusable —
// প্রোফাইল কার্ড ও হোম লিডারবোর্ড দুটোতেই ব্যবহৃত।
type TierMeta = { label: string; Icon: LucideIcon; className: string };

const TIERS: Record<string, TierMeta> = {
  premium: { label: 'Premium', Icon: Crown, className: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' },
  platinum: { label: 'Platinum', Icon: Gem, className: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200' },
  gold: { label: 'Gold', Icon: Award, className: 'bg-gold/10 text-gold ring-1 ring-gold/30' },
  silver: { label: 'Silver', Icon: Medal, className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
  bronze: { label: 'Bronze', Icon: Medal, className: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200' },
};

// none/unknown → ব্যাজ নেই (সাব-Bronze টপ-স্পেন্ডার বা লেভেলহীন ইউজারে কিছু দেখাবে না)।
export function TierBadge({ tier }: { tier: string }) {
  const meta = TIERS[tier];
  if (!meta) return null;
  const { label, Icon, className } = meta;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        className,
      )}
    >
      <Icon size={12} className="shrink-0" />
      {label}
    </span>
  );
}
