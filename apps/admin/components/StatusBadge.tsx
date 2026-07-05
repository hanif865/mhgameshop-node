import clsx from 'clsx';

const TONE: Record<string, string> = {
  completed: 'bg-primary/10 text-primary-dark',
  processing: 'bg-blue-100 text-blue-700',
  autoprocessing: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  hold: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-600',
  paid: 'bg-primary/10 text-primary-dark',
  failed: 'bg-red-100 text-red-600',
  available: 'bg-primary/10 text-primary-dark',
  sold: 'bg-slate-100 text-slate-500',
  success: 'bg-primary/10 text-primary-dark',
  credit: 'bg-primary/10 text-primary-dark',
  debit: 'bg-red-100 text-red-600',
};

export function StatusBadge({ status }: { status: string | number }) {
  const s = String(status);
  const label = s === '1' ? 'Active' : s === '0' ? 'Inactive' : s.replace(/^auto/, 'auto ');
  const tone =
    s === '1' ? 'bg-primary/10 text-primary-dark' : s === '0' ? 'bg-slate-100 text-slate-500' : TONE[s];
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
        tone ?? 'bg-slate-100 text-slate-600',
      )}
    >
      {label}
    </span>
  );
}
