'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useInstallState, promptInstall } from '@/lib/pwa';

export function PWAInstall() {
  // ইনস্টল-অবস্থা শেয়ার্ড স্টোর থেকে (হোমের "ইনস্টল করুন" বাটনও একই deferred ব্যবহার করে)।
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // সার্ভিস ওয়ার্কার রেজিস্টার (গ্লোবাল mount point এখানেই)।
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    // localStorage শুধু ক্লায়েন্টে — mount-এর পর আসল dismiss-অবস্থা পড়ি।
    setDismissed(!!localStorage.getItem('pwa-dismissed'));
  }, []);

  async function install() {
    await promptInstall();
  }

  function dismiss() {
    localStorage.setItem('pwa-dismissed', '1');
    setDismissed(true);
  }

  if (state !== 'ready' || dismissed) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl border border-primary/20 bg-white p-4 shadow-card md:bottom-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white">
          <Download size={20} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-800">Install the app</p>
          <p className="text-xs text-slate-500">Faster access, works offline.</p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-slate-400">
          <X size={18} />
        </button>
      </div>
      <button onClick={install} className="btn-primary mt-3 w-full py-2">
        Install
      </button>
    </div>
  );
}
