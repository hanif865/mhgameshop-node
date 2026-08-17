import type { LucideIcon } from 'lucide-react';

// লিস্ট খালি থাকলে দেখানোর জন্য শেয়ার্ড empty-state কার্ড। referral/spin/creator
// পেজের polished খালি-অবস্থার সাথে মিল রেখে — আইকন + টাইটেল + সাবটাইটেল।
export function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="card p-10 text-center">
      <Icon className="mx-auto mb-3 text-slate-300" size={44} />
      <p className="font-semibold text-slate-700">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}
