'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type Kind = 'success' | 'error' | 'info';
interface T {
  id: number;
  kind: Kind;
  message: string;
}
interface Ctx {
  toast: (m: string, k?: Kind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
}
const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<T[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, kind: Kind = 'info') => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const icons = { success: CheckCircle2, error: XCircle, info: Info };
  const tone = {
    success: 'text-primary-dark',
    error: 'text-red-600',
    info: 'text-slate-700',
  };

  return (
    <ToastContext.Provider value={{ toast, success: (m) => toast(m, 'success'), error: (m) => toast(m, 'error') }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-80 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <Icon size={18} className={clsx('shrink-0', tone[t.kind])} />
              <span className="flex-1 text-sm font-medium text-slate-700">{t.message}</span>
              <button onClick={() => remove(t.id)} className="text-slate-400">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
